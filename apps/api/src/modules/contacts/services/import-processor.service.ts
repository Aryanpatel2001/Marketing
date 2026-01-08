import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Papa from 'papaparse';
import * as fs from 'fs';

import { Contact, ContactStatus, ContactSource } from '../entities/contact.entity';
import { ImportJob, ImportJobStatus, DuplicateHandling } from '../entities/import-job.entity';

export interface ImportProgressEvent {
  jobId: string;
  status: ImportJobStatus;
  processedRows: number;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  currentBatch: number;
  totalBatches: number;
  message: string;
  progress: number;
}

export interface ImportError {
  row: number;
  field?: string;
  value?: string;
  message: string;
}

interface ContactRow {
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  tags?: string[];
  notes?: string;
  status?: string;
}

@Injectable()
export class ImportProcessorService {
  private readonly logger = new Logger(ImportProcessorService.name);
  private readonly BATCH_SIZE = 500; // Optimized batch size for bulk inserts
  private readonly VALIDATION_BATCH_SIZE = 1000;

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * Process import job from uploaded file
   */
  async processImportJob(jobId: string, filePath: string, tenantId: string): Promise<ImportJob> {
    const job = await this.importJobRepository.findOne({ where: { id: jobId } as any });
    if (!job) {
      throw new Error('Import job not found');
    }

    // Update job status to processing
    job.status = ImportJobStatus.PROCESSING;
    job.startedAt = new Date();
    await this.importJobRepository.save(job);
    this.emitProgress(job, 'Starting import...');

    try {
      // Parse CSV file
      const rows = await this.parseCSVFile(filePath, job.fieldMapping);
      job.totalRows = rows.length;
      await this.importJobRepository.save(job);

      // Process in optimized batches
      const totalBatches = Math.ceil(rows.length / this.BATCH_SIZE);
      const errors: ImportError[] = [];

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * this.BATCH_SIZE;
        const batchEnd = Math.min(batchStart + this.BATCH_SIZE, rows.length);
        const batch = rows.slice(batchStart, batchEnd);

        const batchResult = await this.processBatchOptimized(
          tenantId,
          batch,
          batchStart,
          job.duplicateHandling,
          job.duplicateCheckField
        );

        // Update job progress
        job.processedRows = batchEnd;
        job.createdCount += batchResult.created;
        job.updatedCount += batchResult.updated;
        job.skippedCount += batchResult.skipped;
        job.errorCount += batchResult.errors.length;
        errors.push(...batchResult.errors);

        // Save progress every batch
        await this.importJobRepository.save(job);

        // Emit progress event
        this.emitProgress(
          job,
          `Processing batch ${batchIndex + 1} of ${totalBatches}`,
          batchIndex + 1,
          totalBatches
        );
      }

      // Complete job
      job.status = ImportJobStatus.COMPLETED;
      job.completedAt = new Date();
      job.errors = errors.slice(0, 1000); // Store max 1000 errors in DB
      await this.importJobRepository.save(job);

      // Write full error report to file if there are errors
      if (errors.length > 0) {
        await this.writeErrorReport(jobId, errors);
      }

      this.emitProgress(job, 'Import completed successfully!');
      this.logger.log(
        `Import job ${jobId} completed: ${job.createdCount} created, ${job.updatedCount} updated, ${job.skippedCount} skipped, ${job.errorCount} errors`
      );

      // Cleanup uploaded file
      this.cleanupFile(filePath);

      return job;
    } catch (error) {
      job.status = ImportJobStatus.FAILED;
      job.completedAt = new Date();
      job.errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await this.importJobRepository.save(job);

      this.emitProgress(job, `Import failed: ${job.errorMessage}`);
      this.cleanupFile(filePath);

      throw error;
    }
  }

  /**
   * Parse CSV file with field mapping
   */
  private async parseCSVFile(
    filePath: string,
    fieldMapping: Record<string, string>
  ): Promise<ContactRow[]> {
    return new Promise((resolve, reject) => {
      const rows: ContactRow[] = [];
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });

      Papa.parse(fileStream, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => value?.trim() || '',
        complete: (results) => {
          for (const row of results.data as Record<string, string>[]) {
            const mappedRow: ContactRow = {};

            for (const [csvColumn, contactField] of Object.entries(fieldMapping)) {
              if (contactField && contactField !== 'skip' && row[csvColumn]) {
                const value = row[csvColumn];

                if (contactField === 'tags') {
                  mappedRow.tags = value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);
                } else {
                  (mappedRow as any)[contactField] = value;
                }
              }
            }

            // Only add if at least one contact method exists
            if (mappedRow.email || mappedRow.phone || mappedRow.whatsappNumber) {
              rows.push(mappedRow);
            }
          }
          resolve(rows);
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        },
      });
    });
  }

  /**
   * Process batch with optimized bulk operations
   */
  private async processBatchOptimized(
    tenantId: string,
    batch: ContactRow[],
    batchOffset: number,
    duplicateHandling: DuplicateHandling,
    duplicateCheckField: string
  ): Promise<{ created: number; updated: number; skipped: number; errors: ImportError[] }> {
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as ImportError[] };

    // Pre-validate batch
    const validRows: { row: ContactRow; index: number }[] = [];
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const rowIndex = batchOffset + i + 2; // +2 for 1-indexed and header row

      const validationError = this.validateContactRow(row);
      if (validationError) {
        result.errors.push({ row: rowIndex, message: validationError });
        result.skipped++;
        continue;
      }

      validRows.push({ row, index: rowIndex });
    }

    if (validRows.length === 0) {
      return result;
    }

    // Find existing contacts based on duplicate check field
    const existingContactsMap = await this.findExistingContactsBatch(
      tenantId,
      validRows.map((r) => r.row),
      duplicateCheckField
    );

    // Separate into create and update batches
    const toCreate: { contact: Partial<Contact>; rowIndex: number }[] = [];
    const toUpdate: { existing: Contact; row: ContactRow; rowIndex: number }[] = [];

    for (const { row, index } of validRows) {
      const existingContact = this.getExistingContact(
        row,
        existingContactsMap,
        duplicateCheckField
      );

      if (existingContact) {
        switch (duplicateHandling) {
          case DuplicateHandling.SKIP:
            result.skipped++;
            break;
          case DuplicateHandling.UPDATE:
            toUpdate.push({ existing: existingContact, row, rowIndex: index });
            break;
          case DuplicateHandling.CREATE_NEW:
            toCreate.push({ contact: this.rowToContact(tenantId, row), rowIndex: index });
            break;
        }
      } else {
        toCreate.push({ contact: this.rowToContact(tenantId, row), rowIndex: index });
      }
    }

    // Bulk create new contacts
    if (toCreate.length > 0) {
      try {
        await this.bulkCreateContacts(toCreate.map((c) => c.contact));
        result.created += toCreate.length;
      } catch (error) {
        // If bulk insert fails, try individual inserts
        for (const { contact, rowIndex } of toCreate) {
          try {
            await this.contactRepository.save(this.contactRepository.create(contact));
            result.created++;
          } catch (err) {
            result.errors.push({
              row: rowIndex,
              message: err instanceof Error ? err.message : 'Failed to create contact',
            });
            result.skipped++;
          }
        }
      }
    }

    // Bulk update existing contacts
    if (toUpdate.length > 0) {
      for (const { existing, row, rowIndex } of toUpdate) {
        try {
          this.mergeContactData(existing, row);
          await this.contactRepository.save(existing);
          result.updated++;
        } catch (error) {
          result.errors.push({
            row: rowIndex,
            message: error instanceof Error ? error.message : 'Failed to update contact',
          });
          result.skipped++;
        }
      }
    }

    return result;
  }

  /**
   * Bulk insert contacts using query builder for better performance
   */
  private async bulkCreateContacts(contacts: Partial<Contact>[]): Promise<void> {
    if (contacts.length === 0) return;

    // Use repository save for bulk insert with proper type handling
    const contactEntities = contacts.map((contact) => this.contactRepository.create(contact));

    await this.contactRepository.save(contactEntities, { chunk: 100 });
  }

  /**
   * Find existing contacts in batch
   */
  private async findExistingContactsBatch(
    tenantId: string,
    rows: ContactRow[],
    checkField: string
  ): Promise<Map<string, Contact>> {
    const contacts = new Map<string, Contact>();

    // Extract values to check
    const emails = rows.filter((r) => r.email).map((r) => r.email!.toLowerCase());
    const phones = rows.filter((r) => r.phone).map((r) => this.normalizePhone(r.phone!));

    let existingContacts: Contact[] = [];

    if (checkField === 'email' && emails.length > 0) {
      existingContacts = await this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.tenant_id = :tenantId', { tenantId })
        .andWhere('LOWER(contact.email) IN (:...emails)', { emails })
        .andWhere('contact.deleted_at IS NULL')
        .getMany();
    } else if (checkField === 'phone' && phones.length > 0) {
      existingContacts = await this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.tenant_id = :tenantId', { tenantId })
        .andWhere("REPLACE(REPLACE(contact.phone, ' ', ''), '-', '') IN (:...phones)", { phones })
        .andWhere('contact.deleted_at IS NULL')
        .getMany();
    } else if (checkField === 'both') {
      if (emails.length > 0 || phones.length > 0) {
        const qb = this.contactRepository
          .createQueryBuilder('contact')
          .where('contact.tenant_id = :tenantId', { tenantId })
          .andWhere('contact.deleted_at IS NULL');

        if (emails.length > 0 && phones.length > 0) {
          qb.andWhere(
            "(LOWER(contact.email) IN (:...emails) OR REPLACE(REPLACE(contact.phone, ' ', ''), '-', '') IN (:...phones))",
            { emails, phones }
          );
        } else if (emails.length > 0) {
          qb.andWhere('LOWER(contact.email) IN (:...emails)', { emails });
        } else {
          qb.andWhere("REPLACE(REPLACE(contact.phone, ' ', ''), '-', '') IN (:...phones)", {
            phones,
          });
        }

        existingContacts = await qb.getMany();
      }
    }

    // Build lookup map
    for (const contact of existingContacts) {
      if (contact.email) {
        contacts.set(`email:${contact.email.toLowerCase()}`, contact);
      }
      if (contact.phone) {
        contacts.set(`phone:${this.normalizePhone(contact.phone)}`, contact);
      }
    }

    return contacts;
  }

  /**
   * Get existing contact from map based on check field
   */
  private getExistingContact(
    row: ContactRow,
    map: Map<string, Contact>,
    checkField: string
  ): Contact | undefined {
    if (checkField === 'email' && row.email) {
      return map.get(`email:${row.email.toLowerCase()}`);
    }
    if (checkField === 'phone' && row.phone) {
      return map.get(`phone:${this.normalizePhone(row.phone)}`);
    }
    if (checkField === 'both') {
      if (row.email) {
        const byEmail = map.get(`email:${row.email.toLowerCase()}`);
        if (byEmail) return byEmail;
      }
      if (row.phone) {
        const byPhone = map.get(`phone:${this.normalizePhone(row.phone)}`);
        if (byPhone) return byPhone;
      }
    }
    return undefined;
  }

  /**
   * Convert row to contact entity
   */
  private rowToContact(tenantId: string, row: ContactRow): Partial<Contact> {
    return {
      tenantId,
      email: row.email || null,
      phone: row.phone ? this.normalizePhone(row.phone) : null,
      whatsappNumber: row.whatsappNumber ? this.normalizePhone(row.whatsappNumber) : null,
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      company: row.company || null,
      jobTitle: row.jobTitle || null,
      website: row.website || null,
      city: row.city || null,
      state: row.state || null,
      country: row.country || null,
      postalCode: row.postalCode || null,
      tags: row.tags || [],
      notes: row.notes || null,
      source: ContactSource.IMPORT,
      status: (row.status as ContactStatus) || ContactStatus.ACTIVE,
      customFields: {},
    };
  }

  /**
   * Merge imported data into existing contact
   */
  private mergeContactData(contact: Contact, row: ContactRow): void {
    if (row.email) contact.email = row.email;
    if (row.phone) contact.phone = this.normalizePhone(row.phone);
    if (row.whatsappNumber) contact.whatsappNumber = this.normalizePhone(row.whatsappNumber);
    if (row.firstName) contact.firstName = row.firstName;
    if (row.lastName) contact.lastName = row.lastName;
    if (row.company) contact.company = row.company;
    if (row.jobTitle) contact.jobTitle = row.jobTitle;
    if (row.website) contact.website = row.website;
    if (row.city) contact.city = row.city;
    if (row.state) contact.state = row.state;
    if (row.country) contact.country = row.country;
    if (row.postalCode) contact.postalCode = row.postalCode;
    if (row.notes) contact.notes = row.notes;
    if (row.status) contact.status = row.status as ContactStatus;
    if (row.tags?.length) {
      contact.tags = [...new Set([...contact.tags, ...row.tags])];
    }
  }

  /**
   * Validate contact row
   */
  private validateContactRow(row: ContactRow): string | null {
    if (!row.email && !row.phone && !row.whatsappNumber) {
      return 'At least one contact method (email, phone, or WhatsApp) is required';
    }

    if (row.email && !this.isValidEmail(row.email)) {
      return `Invalid email format: ${row.email}`;
    }

    return null;
  }

  /**
   * Write error report to file
   */
  private async writeErrorReport(jobId: string, errors: ImportError[]): Promise<void> {
    const reportPath = `./uploads/import-errors/${jobId}.csv`;

    // Ensure directory exists
    const dir = './uploads/import-errors';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const csvContent = Papa.unparse(
      errors.map((e) => ({
        Row: e.row,
        Field: e.field || '',
        Value: e.value || '',
        Error: e.message,
      }))
    );

    fs.writeFileSync(reportPath, csvContent, 'utf-8');
  }

  /**
   * Get error report path for download
   */
  getErrorReportPath(jobId: string): string | null {
    const reportPath = `./uploads/import-errors/${jobId}.csv`;
    return fs.existsSync(reportPath) ? reportPath : null;
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    job: ImportJob,
    message: string,
    currentBatch?: number,
    totalBatches?: number
  ): void {
    const progress = job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

    const event: ImportProgressEvent = {
      jobId: job.id,
      status: job.status,
      processedRows: job.processedRows,
      totalRows: job.totalRows,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      currentBatch: currentBatch || 0,
      totalBatches: totalBatches || 0,
      message,
      progress,
    };

    this.eventEmitter.emit(`import.progress.${job.id}`, event);
  }

  /**
   * Cleanup uploaded file
   */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup file ${filePath}: ${error}`);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '');
  }
}
