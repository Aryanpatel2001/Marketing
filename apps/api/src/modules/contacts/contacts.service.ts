import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { Contact, ContactStatus, ContactSource } from './entities/contact.entity';
import { ContactList, ListType } from './entities/contact-list.entity';
import { ContactListMember } from './entities/contact-list-member.entity';
import { ContactActivity, ActivityType } from './entities/contact-activity.entity';
import {
  ImportJob,
  ImportJobStatus,
  DuplicateHandling as ImportDuplicateHandling,
} from './entities/import-job.entity';
import {
  CreateContactDto,
  UpdateContactDto,
  FilterContactsDto,
  CreateContactListDto,
  UpdateContactListDto,
  BulkDeleteContactsDto,
  BulkUpdateContactsDto,
  AddContactsToListDto,
  ImportContactsDto,
  ImportResultDto,
  ImportContactDataDto,
  DuplicateHandling,
  DuplicateCheckField,
} from './dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(ContactList)
    private readonly contactListRepository: Repository<ContactList>,
    @InjectRepository(ContactListMember)
    private readonly contactListMemberRepository: Repository<ContactListMember>,
    @InjectRepository(ContactActivity)
    private readonly activityRepository: Repository<ContactActivity>,
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>
  ) {}

  // ==================== CONTACTS ====================

  async create(tenantId: string, dto: CreateContactDto): Promise<Contact> {
    // Check for duplicate email within tenant
    if (dto.email) {
      const existingContact = await this.contactRepository.findOne({
        where: { tenantId, email: dto.email },
      });
      if (existingContact) {
        throw new ConflictException('A contact with this email already exists');
      }
    }

    const contact = this.contactRepository.create({
      ...dto,
      tenantId,
      source: dto.source || ContactSource.MANUAL,
      status: dto.status || ContactStatus.ACTIVE,
      tags: dto.tags || [],
      customFields: dto.customFields || {},
    });

    const savedContact = await this.contactRepository.save(contact);

    // Add to lists if specified
    if (dto.listIds?.length) {
      await this.addContactToLists(tenantId, savedContact.id, dto.listIds);
    }

    return savedContact;
  }

  async findAll(
    tenantId: string,
    query: FilterContactsDto
  ): Promise<PaginatedResponseDto<Contact>> {
    const queryBuilder = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere('contact.deleted_at IS NULL');

    // Apply filters
    if (query.status) {
      queryBuilder.andWhere('contact.status = :status', { status: query.status });
    }

    if (query.source) {
      queryBuilder.andWhere('contact.source = :source', { source: query.source });
    }

    if (query.emailStatus) {
      queryBuilder.andWhere('contact.email_status = :emailStatus', {
        emailStatus: query.emailStatus,
      });
    }

    if (query.smsStatus) {
      queryBuilder.andWhere('contact.sms_status = :smsStatus', {
        smsStatus: query.smsStatus,
      });
    }

    if (query.tags?.length) {
      queryBuilder.andWhere('contact.tags && :tags', { tags: query.tags });
    }

    if (query.country) {
      queryBuilder.andWhere('contact.country ILIKE :country', {
        country: `%${query.country}%`,
      });
    }

    if (query.city) {
      queryBuilder.andWhere('contact.city ILIKE :city', {
        city: `%${query.city}%`,
      });
    }

    if (query.hasEmail !== undefined) {
      if (query.hasEmail) {
        queryBuilder.andWhere('contact.email IS NOT NULL');
      } else {
        queryBuilder.andWhere('contact.email IS NULL');
      }
    }

    if (query.hasPhone !== undefined) {
      if (query.hasPhone) {
        queryBuilder.andWhere('contact.phone IS NOT NULL');
      } else {
        queryBuilder.andWhere('contact.phone IS NULL');
      }
    }

    // Advanced filters
    if (query.hasWhatsapp !== undefined) {
      if (query.hasWhatsapp) {
        queryBuilder.andWhere('contact.whatsapp_number IS NOT NULL');
      } else {
        queryBuilder.andWhere('contact.whatsapp_number IS NULL');
      }
    }

    if (query.company) {
      queryBuilder.andWhere('contact.company ILIKE :company', {
        company: `%${query.company}%`,
      });
    }

    // Date range filters
    if (query.createdAfter) {
      queryBuilder.andWhere('contact.created_at >= :createdAfter', {
        createdAfter: new Date(query.createdAfter),
      });
    }

    if (query.createdBefore) {
      queryBuilder.andWhere('contact.created_at <= :createdBefore', {
        createdBefore: new Date(query.createdBefore),
      });
    }

    if (query.lastActivityAfter) {
      queryBuilder.andWhere('contact.last_activity_at >= :lastActivityAfter', {
        lastActivityAfter: new Date(query.lastActivityAfter),
      });
    }

    if (query.lastActivityBefore) {
      queryBuilder.andWhere('contact.last_activity_at <= :lastActivityBefore', {
        lastActivityBefore: new Date(query.lastActivityBefore),
      });
    }

    // Engagement score filters
    if (query.minEngagementScore !== undefined) {
      queryBuilder.andWhere('contact.engagement_score >= :minScore', {
        minScore: query.minEngagementScore,
      });
    }

    if (query.maxEngagementScore !== undefined) {
      queryBuilder.andWhere('contact.engagement_score <= :maxScore', {
        maxScore: query.maxEngagementScore,
      });
    }

    // Activity-based filters
    if (query.neverContacted) {
      queryBuilder.andWhere('contact.total_emails_sent = 0');
    }

    if (query.hasOpened) {
      queryBuilder.andWhere('contact.total_emails_opened > 0');
    }

    if (query.hasClicked) {
      queryBuilder.andWhere('contact.total_emails_clicked > 0');
    }

    // Filter by list membership
    if (query.listId) {
      queryBuilder.innerJoin(
        'contact_list_members',
        'clm',
        'clm.contact_id = contact.id AND clm.contact_list_id = :listId',
        { listId: query.listId }
      );
    }

    // Search across multiple fields
    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('contact.email ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.first_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.last_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.company ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.phone ILIKE :search', { search: `%${query.search}%` });
        })
      );
    }

    // Sorting
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    queryBuilder.orderBy(`contact.${this.toSnakeCase(sortField)}`, sortOrder);

    // Pagination
    const total = await queryBuilder.getCount();
    const contacts = await queryBuilder
      .skip(query.skip)
      .take(query.limit || 20)
      .getMany();

    return new PaginatedResponseDto(contacts, query.page || 1, query.limit || 20, total);
  }

  async findOne(tenantId: string, id: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id, tenantId },
      relations: ['listMemberships', 'listMemberships.contactList'],
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async update(tenantId: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);

    // Check for duplicate email if email is being changed
    if (dto.email && dto.email !== contact.email) {
      const existingContact = await this.contactRepository.findOne({
        where: { tenantId, email: dto.email },
      });
      if (existingContact && existingContact.id !== id) {
        throw new ConflictException('A contact with this email already exists');
      }
    }

    Object.assign(contact, dto);
    return this.contactRepository.save(contact);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const contact = await this.findOne(tenantId, id);
    await this.contactRepository.softRemove(contact);
  }

  async bulkDelete(tenantId: string, dto: BulkDeleteContactsDto): Promise<{ deleted: number }> {
    const result = await this.contactRepository.softDelete({
      id: In(dto.ids),
      tenantId,
    });
    return { deleted: result.affected || 0 };
  }

  async bulkUpdate(tenantId: string, dto: BulkUpdateContactsDto): Promise<{ updated: number }> {
    const contacts = await this.contactRepository.find({
      where: { id: In(dto.ids), tenantId },
    });

    for (const contact of contacts) {
      if (dto.addTags?.length) {
        const uniqueTags = [...new Set([...contact.tags, ...dto.addTags])];
        contact.tags = uniqueTags;
      }

      if (dto.removeTags?.length) {
        contact.tags = contact.tags.filter((tag) => !dto.removeTags!.includes(tag));
      }

      if (dto.status) {
        contact.status = dto.status;
      }
    }

    await this.contactRepository.save(contacts);
    return { updated: contacts.length };
  }

  async addTags(tenantId: string, id: string, tags: string[]): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);
    const uniqueTags = [...new Set([...contact.tags, ...tags])];
    contact.tags = uniqueTags;
    return this.contactRepository.save(contact);
  }

  async removeTags(tenantId: string, id: string, tags: string[]): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);
    contact.tags = contact.tags.filter((tag) => !tags.includes(tag));
    return this.contactRepository.save(contact);
  }

  async getStats(tenantId: string): Promise<{
    total: number;
    active: number;
    unsubscribed: number;
    bounced: number;
    bySource: Record<string, number>;
  }> {
    const total = await this.contactRepository.count({
      where: { tenantId },
    });

    const active = await this.contactRepository.count({
      where: { tenantId, status: ContactStatus.ACTIVE },
    });

    const unsubscribed = await this.contactRepository.count({
      where: { tenantId, status: ContactStatus.UNSUBSCRIBED },
    });

    const bounced = await this.contactRepository.count({
      where: { tenantId, status: ContactStatus.BOUNCED },
    });

    const sourceStats = await this.contactRepository
      .createQueryBuilder('contact')
      .select('contact.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .groupBy('contact.source')
      .getRawMany();

    const bySource: Record<string, number> = {};
    sourceStats.forEach((stat) => {
      bySource[stat.source] = parseInt(stat.count, 10);
    });

    return { total, active, unsubscribed, bounced, bySource };
  }

  // ==================== IMPORT/EXPORT ====================

  async importContacts(tenantId: string, dto: ImportContactsDto): Promise<ImportResultDto> {
    const result: ImportResultDto = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Process contacts in batches for better performance
    const batchSize = 50;
    const contacts = dto.contacts;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      await this.processImportBatch(
        tenantId,
        batch,
        dto.duplicateHandling,
        dto.duplicateCheckField,
        dto.updateExistingTags || false,
        i,
        result
      );
    }

    return result;
  }

  private async processImportBatch(
    tenantId: string,
    batch: ImportContactDataDto[],
    duplicateHandling: DuplicateHandling,
    duplicateCheckField: DuplicateCheckField,
    updateExistingTags: boolean,
    batchOffset: number,
    result: ImportResultDto
  ): Promise<void> {
    for (let i = 0; i < batch.length; i++) {
      const contactData = batch[i];
      const rowIndex = batchOffset + i;

      try {
        // Validate that at least one contact method is provided
        if (!contactData.email && !contactData.phone && !contactData.whatsappNumber) {
          result.errors!.push({
            index: rowIndex,
            message: 'At least one contact method (email, phone, or WhatsApp) is required',
          });
          result.skipped++;
          continue;
        }

        // Validate email format if provided
        if (contactData.email && !this.isValidEmail(contactData.email)) {
          result.errors!.push({
            index: rowIndex,
            message: `Invalid email format: ${contactData.email}`,
          });
          result.skipped++;
          continue;
        }

        // Check for existing contact
        const existingContact = await this.findExistingContact(
          tenantId,
          contactData,
          duplicateCheckField
        );

        if (existingContact) {
          // Handle duplicate based on settings
          switch (duplicateHandling) {
            case DuplicateHandling.SKIP:
              result.skipped++;
              break;

            case DuplicateHandling.UPDATE:
              await this.updateContactFromImport(existingContact, contactData, updateExistingTags);
              result.updated++;
              break;

            case DuplicateHandling.CREATE_NEW:
              await this.createContactFromImport(tenantId, contactData);
              result.created++;
              break;
          }
        } else {
          // Create new contact
          await this.createContactFromImport(tenantId, contactData);
          result.created++;
        }
      } catch (error) {
        result.errors!.push({
          index: rowIndex,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
        result.skipped++;
      }
    }
  }

  private async findExistingContact(
    tenantId: string,
    contactData: ImportContactDataDto,
    checkField: DuplicateCheckField
  ): Promise<Contact | null> {
    const queryBuilder = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere('contact.deleted_at IS NULL');

    switch (checkField) {
      case DuplicateCheckField.EMAIL:
        if (!contactData.email) return null;
        queryBuilder.andWhere('LOWER(contact.email) = LOWER(:email)', {
          email: contactData.email,
        });
        break;

      case DuplicateCheckField.PHONE: {
        if (!contactData.phone) return null;
        // Normalize phone for comparison (remove spaces, dashes)
        const normalizedPhone = this.normalizePhone(contactData.phone);
        queryBuilder.andWhere(
          "REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '+', '') = :phone",
          { phone: normalizedPhone.replace('+', '') }
        );
        break;
      }

      case DuplicateCheckField.BOTH: {
        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (contactData.email) {
          conditions.push('LOWER(contact.email) = LOWER(:email)');
          params.email = contactData.email;
        }
        if (contactData.phone) {
          conditions.push(
            "REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '+', '') = :phone"
          );
          params.phone = this.normalizePhone(contactData.phone).replace('+', '');
        }

        if (conditions.length === 0) return null;

        queryBuilder.andWhere(
          new Brackets((qb) => {
            conditions.forEach((condition, idx) => {
              if (idx === 0) {
                qb.where(condition, params);
              } else {
                qb.orWhere(condition, params);
              }
            });
          })
        );
        break;
      }
    }

    return queryBuilder.getOne();
  }

  private async createContactFromImport(
    tenantId: string,
    data: ImportContactDataDto
  ): Promise<Contact> {
    const contact = this.contactRepository.create({
      tenantId,
      email: data.email || null,
      phone: data.phone ? this.normalizePhone(data.phone) : null,
      whatsappNumber: data.whatsappNumber ? this.normalizePhone(data.whatsappNumber) : null,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      company: data.company || null,
      jobTitle: data.jobTitle || null,
      website: data.website || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      postalCode: data.postalCode || null,
      tags: data.tags || [],
      notes: data.notes || null,
      source: ContactSource.IMPORT,
      status: (data.status as ContactStatus) || ContactStatus.ACTIVE,
      customFields: {},
    });

    return this.contactRepository.save(contact);
  }

  private async updateContactFromImport(
    existingContact: Contact,
    data: ImportContactDataDto,
    replaceExistingTags: boolean
  ): Promise<Contact> {
    // Only update fields that have values in the import data
    if (data.email) existingContact.email = data.email;
    if (data.phone) existingContact.phone = this.normalizePhone(data.phone);
    if (data.whatsappNumber)
      existingContact.whatsappNumber = this.normalizePhone(data.whatsappNumber);
    if (data.firstName) existingContact.firstName = data.firstName;
    if (data.lastName) existingContact.lastName = data.lastName;
    if (data.company) existingContact.company = data.company;
    if (data.jobTitle) existingContact.jobTitle = data.jobTitle;
    if (data.website) existingContact.website = data.website;
    if (data.city) existingContact.city = data.city;
    if (data.state) existingContact.state = data.state;
    if (data.country) existingContact.country = data.country;
    if (data.postalCode) existingContact.postalCode = data.postalCode;
    if (data.notes) existingContact.notes = data.notes;
    if (data.status) existingContact.status = data.status as ContactStatus;

    // Handle tags
    if (data.tags?.length) {
      if (replaceExistingTags) {
        existingContact.tags = data.tags;
      } else {
        // Merge tags
        existingContact.tags = [...new Set([...existingContact.tags, ...data.tags])];
      }
    }

    return this.contactRepository.save(existingContact);
  }

  async exportContacts(tenantId: string, query: FilterContactsDto): Promise<Contact[]> {
    // Use findAll logic but without pagination limit
    const queryBuilder = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere('contact.deleted_at IS NULL');

    // Apply same filters as findAll
    if (query.status) {
      queryBuilder.andWhere('contact.status = :status', { status: query.status });
    }

    if (query.source) {
      queryBuilder.andWhere('contact.source = :source', { source: query.source });
    }

    if (query.tags?.length) {
      queryBuilder.andWhere('contact.tags && :tags', { tags: query.tags });
    }

    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('contact.email ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.first_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.last_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('contact.company ILIKE :search', { search: `%${query.search}%` });
        })
      );
    }

    queryBuilder.orderBy('contact.created_at', 'DESC');

    return queryBuilder.getMany();
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private normalizePhone(phone: string): string {
    // Remove all spaces and dashes, keep + at the beginning if present
    return phone.replace(/[\s-]/g, '');
  }

  // ==================== CONTACT LISTS ====================

  async createList(
    tenantId: string,
    userId: string,
    dto: CreateContactListDto
  ): Promise<ContactList> {
    const list = this.contactListRepository.create({
      ...dto,
      tenantId,
      createdById: userId,
      type: dto.type || ListType.STATIC,
    });

    return this.contactListRepository.save(list);
  }

  async findAllLists(tenantId: string): Promise<ContactList[]> {
    return this.contactListRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneList(tenantId: string, id: string): Promise<ContactList> {
    const list = await this.contactListRepository.findOne({
      where: { id, tenantId },
    });

    if (!list) {
      throw new NotFoundException('Contact list not found');
    }

    return list;
  }

  async updateList(tenantId: string, id: string, dto: UpdateContactListDto): Promise<ContactList> {
    const list = await this.findOneList(tenantId, id);
    Object.assign(list, dto);
    return this.contactListRepository.save(list);
  }

  async removeList(tenantId: string, id: string): Promise<void> {
    const list = await this.findOneList(tenantId, id);
    await this.contactListRepository.softRemove(list);
  }

  async getListContacts(
    tenantId: string,
    listId: string,
    query: FilterContactsDto
  ): Promise<PaginatedResponseDto<Contact>> {
    // Verify list exists and belongs to tenant
    await this.findOneList(tenantId, listId);

    // Use the same findAll but with listId filter
    query.listId = listId;
    return this.findAll(tenantId, query);
  }

  async addContactToLists(tenantId: string, contactId: string, listIds: string[]): Promise<void> {
    // Verify contact exists
    await this.findOne(tenantId, contactId);

    // Verify all lists exist and belong to tenant
    const lists = await this.contactListRepository.find({
      where: { id: In(listIds), tenantId },
    });

    if (lists.length !== listIds.length) {
      throw new BadRequestException('One or more lists not found');
    }

    // Add to lists (ignore duplicates)
    for (const listId of listIds) {
      const existing = await this.contactListMemberRepository.findOne({
        where: { contactListId: listId, contactId },
      });

      if (!existing) {
        const member = this.contactListMemberRepository.create({
          contactListId: listId,
          contactId,
        });
        await this.contactListMemberRepository.save(member);

        // Update list count
        await this.updateListCount(listId);
      }
    }
  }

  async addContactsToList(
    tenantId: string,
    listId: string,
    dto: AddContactsToListDto
  ): Promise<{ added: number }> {
    // Verify list exists
    await this.findOneList(tenantId, listId);

    // Verify contacts exist
    const contacts = await this.contactRepository.find({
      where: { id: In(dto.contactIds), tenantId },
    });

    if (contacts.length !== dto.contactIds.length) {
      throw new BadRequestException('One or more contacts not found');
    }

    let added = 0;
    for (const contactId of dto.contactIds) {
      const existing = await this.contactListMemberRepository.findOne({
        where: { contactListId: listId, contactId },
      });

      if (!existing) {
        const member = this.contactListMemberRepository.create({
          contactListId: listId,
          contactId,
        });
        await this.contactListMemberRepository.save(member);
        added++;
      }
    }

    // Update list count
    await this.updateListCount(listId);

    return { added };
  }

  async removeContactsFromList(
    tenantId: string,
    listId: string,
    contactIds: string[]
  ): Promise<{ removed: number }> {
    // Verify list exists
    await this.findOneList(tenantId, listId);

    const result = await this.contactListMemberRepository.delete({
      contactListId: listId,
      contactId: In(contactIds),
    });

    // Update list count
    await this.updateListCount(listId);

    return { removed: result.affected || 0 };
  }

  private async updateListCount(listId: string): Promise<void> {
    const count = await this.contactListMemberRepository.count({
      where: { contactListId: listId },
    });

    await this.contactListRepository.update(listId, { contactCount: count });
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  // ==================== ACTIVITY TRACKING ====================

  async trackActivity(
    contactId: string,
    type: ActivityType,
    data?: {
      title?: string;
      description?: string;
      metadata?: Record<string, unknown>;
      referenceType?: string;
      referenceId?: string;
      performedById?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ContactActivity> {
    const activity = this.activityRepository.create({
      contactId,
      type,
      title: data?.title || null,
      description: data?.description || null,
      metadata: data?.metadata || {},
      referenceType: data?.referenceType || null,
      referenceId: data?.referenceId || null,
      performedById: data?.performedById || null,
      ipAddress: data?.ipAddress || null,
      userAgent: data?.userAgent || null,
    });

    const savedActivity = await this.activityRepository.save(activity);

    // Update contact's last activity timestamp
    await this.contactRepository.update(contactId, {
      lastActivityAt: new Date(),
    });

    return savedActivity;
  }

  async getContactActivities(
    contactId: string,
    options?: { limit?: number; offset?: number; type?: ActivityType }
  ): Promise<{ activities: ContactActivity[]; total: number }> {
    const queryBuilder = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.contact_id = :contactId', { contactId })
      .orderBy('activity.created_at', 'DESC');

    if (options?.type) {
      queryBuilder.andWhere('activity.type = :type', { type: options.type });
    }

    const total = await queryBuilder.getCount();
    const activities = await queryBuilder
      .skip(options?.offset || 0)
      .take(options?.limit || 50)
      .getMany();

    return { activities, total };
  }

  // ==================== IMPORT JOBS ====================

  async createImportJob(
    tenantId: string,
    userId: string,
    data: {
      fileName: string;
      fileSize: number;
      totalRows: number;
      duplicateHandling: string;
      duplicateCheckField: string;
      fieldMapping: Record<string, string>;
    }
  ): Promise<ImportJob> {
    const job = this.importJobRepository.create({
      tenantId,
      createdById: userId,
      fileName: data.fileName,
      fileSize: data.fileSize,
      totalRows: data.totalRows,
      duplicateHandling: data.duplicateHandling as ImportDuplicateHandling,
      duplicateCheckField: data.duplicateCheckField,
      fieldMapping: data.fieldMapping,
      status: ImportJobStatus.PENDING,
    });

    return this.importJobRepository.save(job);
  }

  async updateImportJob(
    jobId: string,
    updates: Partial<{
      status: ImportJobStatus;
      processedRows: number;
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      errorCount: number;
      errors: Array<{ row: number; message: string }>;
      startedAt: Date;
      completedAt: Date;
      errorMessage: string;
    }>
  ): Promise<ImportJob> {
    await this.importJobRepository.update(jobId, updates);
    const job = await this.importJobRepository.findOne({ where: { id: jobId } as any });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }

  async getImportJobs(
    tenantId: string,
    options?: { limit?: number; offset?: number; status?: ImportJobStatus }
  ): Promise<{ jobs: ImportJob[]; total: number }> {
    const queryBuilder = this.importJobRepository
      .createQueryBuilder('job')
      .where('job.tenant_id = :tenantId', { tenantId })
      .orderBy('job.created_at', 'DESC');

    if (options?.status) {
      queryBuilder.andWhere('job.status = :status', { status: options.status });
    }

    const total = await queryBuilder.getCount();
    const jobs = await queryBuilder
      .skip(options?.offset || 0)
      .take(options?.limit || 20)
      .getMany();

    return { jobs, total };
  }

  async getImportJob(tenantId: string, jobId: string): Promise<ImportJob> {
    const job = await this.importJobRepository.findOne({
      where: { id: jobId, tenantId } as any,
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    return job;
  }

  // ==================== BULK TAG MANAGEMENT ====================

  async getAllTags(tenantId: string): Promise<{ tag: string; count: number }[]> {
    const result = await this.contactRepository
      .createQueryBuilder('contact')
      .select('UNNEST(contact.tags)', 'tag')
      .addSelect('COUNT(*)', 'count')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere('contact.deleted_at IS NULL')
      .groupBy('tag')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result.map((r) => ({ tag: r.tag, count: parseInt(r.count, 10) }));
  }

  async renameTag(tenantId: string, oldTag: string, newTag: string): Promise<{ updated: number }> {
    // Find all contacts with the old tag
    const contacts = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere(':oldTag = ANY(contact.tags)', { oldTag })
      .andWhere('contact.deleted_at IS NULL')
      .getMany();

    for (const contact of contacts) {
      const newTags = contact.tags.map((t) => (t === oldTag ? newTag : t));
      // Remove duplicates
      contact.tags = [...new Set(newTags)];
    }

    await this.contactRepository.save(contacts);
    return { updated: contacts.length };
  }

  async deleteTag(tenantId: string, tag: string): Promise<{ updated: number }> {
    // Find all contacts with the tag
    const contacts = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenant_id = :tenantId', { tenantId })
      .andWhere(':tag = ANY(contact.tags)', { tag })
      .andWhere('contact.deleted_at IS NULL')
      .getMany();

    for (const contact of contacts) {
      contact.tags = contact.tags.filter((t) => t !== tag);
    }

    await this.contactRepository.save(contacts);
    return { updated: contacts.length };
  }

  async mergeContacts(
    tenantId: string,
    primaryContactId: string,
    secondaryContactIds: string[]
  ): Promise<Contact> {
    const primaryContact = await this.findOne(tenantId, primaryContactId);
    const secondaryContacts = await this.contactRepository.find({
      where: { id: In(secondaryContactIds), tenantId },
    });

    if (secondaryContacts.length !== secondaryContactIds.length) {
      throw new BadRequestException('One or more contacts not found');
    }

    // Merge data from secondary contacts (fill empty fields from primary)
    for (const secondary of secondaryContacts) {
      // Merge tags
      primaryContact.tags = [...new Set([...primaryContact.tags, ...secondary.tags])];

      // Fill empty fields from secondary
      if (!primaryContact.email && secondary.email) primaryContact.email = secondary.email;
      if (!primaryContact.phone && secondary.phone) primaryContact.phone = secondary.phone;
      if (!primaryContact.whatsappNumber && secondary.whatsappNumber)
        primaryContact.whatsappNumber = secondary.whatsappNumber;
      if (!primaryContact.firstName && secondary.firstName)
        primaryContact.firstName = secondary.firstName;
      if (!primaryContact.lastName && secondary.lastName)
        primaryContact.lastName = secondary.lastName;
      if (!primaryContact.company && secondary.company) primaryContact.company = secondary.company;
      if (!primaryContact.jobTitle && secondary.jobTitle)
        primaryContact.jobTitle = secondary.jobTitle;
      if (!primaryContact.city && secondary.city) primaryContact.city = secondary.city;
      if (!primaryContact.country && secondary.country) primaryContact.country = secondary.country;

      // Aggregate engagement metrics
      primaryContact.totalEmailsSent += secondary.totalEmailsSent;
      primaryContact.totalEmailsOpened += secondary.totalEmailsOpened;
      primaryContact.totalEmailsClicked += secondary.totalEmailsClicked;

      // Move list memberships
      await this.contactListMemberRepository.update(
        { contactId: secondary.id },
        { contactId: primaryContact.id }
      );

      // Soft delete the secondary contact
      await this.contactRepository.softRemove(secondary);

      // Track merge activity
      await this.trackActivity(primaryContact.id, ActivityType.MERGED, {
        description: `Merged with contact ${secondary.email || secondary.phone || secondary.id}`,
        metadata: { mergedContactId: secondary.id },
      });
    }

    return this.contactRepository.save(primaryContact);
  }
}
