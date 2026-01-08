import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  Sse,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpStatus,
  HttpException,
  MessageEvent,
  Header,
  StreamableFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { Observable, Subject, interval, map, takeUntil, merge } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentTenant } from '@/common/decorators';
import { ImportProcessorService, ImportProgressEvent } from './services/import-processor.service';
import { ImportJob, ImportJobStatus, DuplicateHandling } from './entities/import-job.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Multer configuration for file uploads
const uploadConfig = {
  storage: diskStorage({
    destination: './uploads/imports',
    filename: (req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
      callback(null, `${uniqueSuffix}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (req: any, file: any, callback: any) => {
    if (!file.originalname.match(/\.(csv)$/i)) {
      return callback(
        new HttpException('Only CSV files are allowed', HttpStatus.BAD_REQUEST),
        false
      );
    }
    callback(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
};

interface _CreateImportJobDto {
  fieldMapping: Record<string, string>;
  duplicateHandling: DuplicateHandling;
  duplicateCheckField: string;
}

@ApiTags('Contact Import')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('contacts/import')
export class ImportController {
  private readonly logger = new Logger(ImportController.name);
  private activeJobs = new Map<string, Subject<void>>();

  constructor(
    private readonly importProcessorService: ImportProcessorService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>
  ) {
    // Ensure upload directories exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = ['./uploads/imports', './uploads/import-errors'];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload CSV file for import' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded, returns preview data' })
  async uploadFile(@CurrentTenant() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Parse first few rows for preview
    const Papa = await import('papaparse');
    const fileContent = fs.readFileSync(file.path, 'utf-8');

    const parseResult = Papa.default.parse(fileContent, {
      header: true,
      preview: 10, // Only parse first 10 rows for preview
      skipEmptyLines: true,
    });

    // Count total rows
    const fullParse = Papa.default.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    return {
      fileId: file.filename,
      filePath: file.path,
      fileName: file.originalname,
      fileSize: file.size,
      headers: parseResult.meta.fields || [],
      previewData: parseResult.data,
      totalRows: fullParse.data.length,
    };
  }

  @Post('start')
  @ApiOperation({ summary: 'Start import job with field mapping' })
  @ApiResponse({ status: 201, description: 'Import job created and started' })
  async startImport(
    @CurrentTenant() tenantId: string,
    @Body()
    body: {
      fileId: string;
      filePath: string;
      fileSize: number;
      totalRows: number;
      fieldMapping: Record<string, string>;
      duplicateHandling: DuplicateHandling;
      duplicateCheckField: string;
    }
  ): Promise<ImportJob> {
    const {
      fileId,
      filePath,
      fileSize,
      totalRows,
      fieldMapping,
      duplicateHandling,
      duplicateCheckField,
    } = body;

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new HttpException('Import file not found. Please upload again.', HttpStatus.NOT_FOUND);
    }

    // Create import job record
    const job = this.importJobRepository.create({
      tenantId,
      fileName: fileId,
      fileSize: fileSize || 0,
      status: ImportJobStatus.PENDING,
      fieldMapping,
      duplicateHandling,
      duplicateCheckField,
      totalRows: totalRows || 0,
      processedRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    });

    await this.importJobRepository.save(job);

    // Process import in background
    this.processImportAsync(job.id, filePath, tenantId);

    return job;
  }

  private async processImportAsync(jobId: string, filePath: string, tenantId: string) {
    try {
      await this.importProcessorService.processImportJob(jobId, filePath, tenantId);
    } catch (error) {
      this.logger.error(`Import job ${jobId} failed:`, error);
    }
  }

  @Sse('progress/:jobId')
  @ApiOperation({ summary: 'SSE endpoint for real-time import progress' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  streamProgress(@Param('jobId', ParseUUIDPipe) jobId: string): Observable<MessageEvent> {
    const destroy$ = new Subject<void>();
    this.activeJobs.set(jobId, destroy$);

    // Create observable from event emitter
    const progressEvents$ = new Observable<ImportProgressEvent>((observer) => {
      const eventName = `import.progress.${jobId}`;

      const listener = (event: ImportProgressEvent) => {
        observer.next(event);

        // Complete on terminal states
        if (event.status === ImportJobStatus.COMPLETED || event.status === ImportJobStatus.FAILED) {
          setTimeout(() => {
            observer.complete();
            destroy$.next();
            destroy$.complete();
            this.activeJobs.delete(jobId);
          }, 1000); // Allow final event to be sent
        }
      };

      this.eventEmitter.on(eventName, listener);

      return () => {
        this.eventEmitter.off(eventName, listener);
      };
    });

    // Send heartbeat every 5 seconds to keep connection alive
    const heartbeat$ = interval(5000).pipe(
      map(() => ({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      }))
    );

    // Initial status check
    const initialCheck$ = new Observable<ImportProgressEvent>((observer) => {
      this.importJobRepository
        .findOne({ where: { id: jobId } as any })
        .then((job) => {
          if (job) {
            observer.next({
              jobId: job.id,
              status: job.status,
              processedRows: job.processedRows,
              totalRows: job.totalRows,
              createdCount: job.createdCount,
              updatedCount: job.updatedCount,
              skippedCount: job.skippedCount,
              errorCount: job.errorCount,
              currentBatch: 0,
              totalBatches: 0,
              message:
                job.status === ImportJobStatus.PENDING ? 'Waiting to start...' : 'Processing...',
              progress:
                job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0,
            });
          }
          observer.complete();
        })
        .catch(() => observer.complete());
    });

    return merge(initialCheck$, progressEvents$, heartbeat$).pipe(
      takeUntil(destroy$),
      map(
        (data: any): MessageEvent => ({
          data: JSON.stringify(data),
          type: data.type === 'heartbeat' ? 'heartbeat' : 'progress',
        })
      )
    );
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get current import job status' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns import job status' })
  async getJobStatus(
    @CurrentTenant() tenantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string
  ): Promise<ImportJob> {
    const job = await this.importJobRepository.findOne({
      where: { id: jobId, tenantId } as any,
    });

    if (!job) {
      throw new HttpException('Import job not found', HttpStatus.NOT_FOUND);
    }

    return job;
  }

  @Get(':jobId/errors')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="import-errors.csv"')
  @ApiOperation({ summary: 'Download error report for import job' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Error report CSV download' })
  async downloadErrorReport(
    @CurrentTenant() tenantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Res({ passthrough: true }) _res: Response
  ): Promise<StreamableFile> {
    // Verify job belongs to tenant
    const job = await this.importJobRepository.findOne({
      where: { id: jobId, tenantId } as any,
    });

    if (!job) {
      throw new HttpException('Import job not found', HttpStatus.NOT_FOUND);
    }

    // Check for error report file
    const errorReportPath = this.importProcessorService.getErrorReportPath(jobId);

    if (errorReportPath && fs.existsSync(errorReportPath)) {
      // Return file from disk
      const buffer = fs.readFileSync(errorReportPath);
      return new StreamableFile(buffer);
    }

    // Generate from job errors if no file
    if (job.errors && job.errors.length > 0) {
      const Papa = await import('papaparse');
      const csvContent = Papa.default.unparse(
        job.errors.map((e: any) => ({
          Row: e.row,
          Field: e.field || '',
          Value: e.value || '',
          Error: e.message,
        }))
      );
      const buffer = Buffer.from(csvContent, 'utf-8');
      return new StreamableFile(buffer);
    }

    throw new HttpException('No errors to download', HttpStatus.NOT_FOUND);
  }

  @Post(':jobId/cancel')
  @ApiOperation({ summary: 'Cancel an in-progress import job' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Import job cancelled' })
  async cancelImport(
    @CurrentTenant() tenantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string
  ) {
    const job = await this.importJobRepository.findOne({
      where: { id: jobId, tenantId } as any,
    });

    if (!job) {
      throw new HttpException('Import job not found', HttpStatus.NOT_FOUND);
    }

    if (job.status !== ImportJobStatus.PROCESSING && job.status !== ImportJobStatus.PENDING) {
      throw new HttpException('Cannot cancel a completed or failed job', HttpStatus.BAD_REQUEST);
    }

    // Close SSE connection
    const destroy$ = this.activeJobs.get(jobId);
    if (destroy$) {
      destroy$.next();
      destroy$.complete();
      this.activeJobs.delete(jobId);
    }

    job.status = ImportJobStatus.CANCELLED;
    job.completedAt = new Date();
    await this.importJobRepository.save(job);

    return { message: 'Import job cancelled' };
  }
}
