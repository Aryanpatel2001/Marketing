import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bull, { Job, JobOptions, Queue } from 'bull';

export interface SmsBatchJob {
  campaignId: string;
  tenantId: string;
  batchId: string;
  messages: SmsMessageJob[];
  priority: number;
}

export interface SmsMessageJob {
  messageId: string;
  campaignId: string;
  tenantId: string;
  contactId: string;
  phoneNumber: string;
  content: string;
  senderId?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, any>;
  attempt?: number;
}

export interface SmsRetryJob extends SmsMessageJob {
  lastError: string;
  nextRetryAt: Date;
}

export interface SmsPrepareJob {
  campaignId: string;
  tenantId: string;
  totalRecipients: number;
}

export interface SmsTrackingJob {
  messageId: string;
  campaignId: string;
  tenantId: string;
  externalId: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: Date;
}

// Queue names
export const SMS_BULL_QUEUES = {
  PREPARE: 'sms-prepare',
  SEND: 'sms-send',
  SEND_BATCH: 'sms-send-batch',
  RETRY: 'sms-retry',
  TRACKING: 'sms-tracking',
} as const;

// Priority levels (lower = higher priority)
export enum SmsPriority {
  CRITICAL = 1, // System messages
  HIGH = 2, // Enterprise tier
  NORMAL = 3, // Pro tier
  LOW = 4, // Starter/Free tier
}

@Injectable()
export class BullSmsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullSmsQueueService.name);

  private prepareQueue: Queue<SmsPrepareJob>;
  private sendQueue: Queue<SmsMessageJob>;
  private sendBatchQueue: Queue<SmsBatchJob>;
  private retryQueue: Queue<SmsRetryJob>;
  private trackingQueue: Queue<SmsTrackingJob>;

  private readonly redisConfig: { host: string; port: number; password?: string };
  private readonly defaultJobOptions: JobOptions;

  constructor(private readonly configService: ConfigService) {
    this.logger.log('BullSmsQueueService constructor called');

    this.redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };

    this.defaultJobOptions = {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    };

    this.logger.log(
      `BullSmsQueueService configured with Redis: ${this.redisConfig.host}:${this.redisConfig.port}`
    );
  }

  async onModuleInit() {
    try {
      this.logger.log('Initializing Bull SMS queues...');
      await this.initializeQueues();
      this.logger.log('Bull SMS queues initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Bull SMS queues: ${error.message}`, error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.closeQueues();
    this.logger.log('Bull SMS queues closed');
  }

  private async initializeQueues() {
    try {
      const queueOptions = {
        redis: this.redisConfig,
        defaultJobOptions: this.defaultJobOptions,
      };

      this.logger.log(`Connecting to Redis at ${this.redisConfig.host}:${this.redisConfig.port}`);

      // Initialize all queues
      this.prepareQueue = new Bull(SMS_BULL_QUEUES.PREPARE, queueOptions);
      this.logger.debug(`Created queue: ${SMS_BULL_QUEUES.PREPARE}`);

      this.sendQueue = new Bull(SMS_BULL_QUEUES.SEND, queueOptions);
      this.logger.debug(`Created queue: ${SMS_BULL_QUEUES.SEND}`);

      this.sendBatchQueue = new Bull(SMS_BULL_QUEUES.SEND_BATCH, queueOptions);
      this.logger.debug(`Created queue: ${SMS_BULL_QUEUES.SEND_BATCH}`);

      this.retryQueue = new Bull(SMS_BULL_QUEUES.RETRY, queueOptions);
      this.logger.debug(`Created queue: ${SMS_BULL_QUEUES.RETRY}`);

      this.trackingQueue = new Bull(SMS_BULL_QUEUES.TRACKING, queueOptions);
      this.logger.debug(`Created queue: ${SMS_BULL_QUEUES.TRACKING}`);

      // Set up error handlers
      const queues = [
        this.prepareQueue,
        this.sendQueue,
        this.sendBatchQueue,
        this.retryQueue,
        this.trackingQueue,
      ];

      for (const queue of queues) {
        queue.on('error', (error) => {
          this.logger.error(`Queue ${queue.name} error: ${error.message}`);
        });

        queue.on('failed', (job, error) => {
          this.logger.warn(`Job ${job.id} in ${queue.name} failed: ${error.message}`);
        });

        queue.on('stalled', (job) => {
          this.logger.warn(`Job ${job.id} in ${queue.name} stalled`);
        });
      }

      this.logger.log('All Bull queues created and event handlers registered');
    } catch (error) {
      this.logger.error(`Error during queue initialization: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async closeQueues() {
    const queues = [
      this.prepareQueue,
      this.sendQueue,
      this.sendBatchQueue,
      this.retryQueue,
      this.trackingQueue,
    ];

    await Promise.all(queues.map((q) => q?.close()));
  }

  // ============================================
  // Prepare Queue Operations
  // ============================================

  async addPrepareJob(
    data: SmsPrepareJob,
    priority = SmsPriority.NORMAL
  ): Promise<Job<SmsPrepareJob>> {
    return this.prepareQueue.add(data, {
      priority,
      jobId: `prepare-${data.campaignId}`,
    });
  }

  getPrepareQueue(): Queue<SmsPrepareJob> {
    return this.prepareQueue;
  }

  // ============================================
  // Send Queue Operations
  // ============================================

  async addSendJob(
    data: SmsMessageJob,
    priority = SmsPriority.NORMAL
  ): Promise<Job<SmsMessageJob>> {
    return this.sendQueue.add(data, {
      priority,
      jobId: `send-${data.messageId}`,
    });
  }

  async addSendJobs(
    messages: SmsMessageJob[],
    priority = SmsPriority.NORMAL
  ): Promise<Job<SmsMessageJob>[]> {
    const jobs = messages.map((msg) => ({
      data: msg,
      opts: {
        priority,
        jobId: `send-${msg.messageId}`,
      },
    }));

    return this.sendQueue.addBulk(jobs);
  }

  getSendQueue(): Queue<SmsMessageJob> {
    return this.sendQueue;
  }

  // ============================================
  // Batch Send Queue Operations
  // ============================================

  async addBatchJob(data: SmsBatchJob): Promise<Job<SmsBatchJob>> {
    return this.sendBatchQueue.add(data, {
      priority: data.priority,
      jobId: `batch-${data.batchId}`,
    });
  }

  async addBatchJobs(batches: SmsBatchJob[]): Promise<Job<SmsBatchJob>[]> {
    const jobs = batches.map((batch) => ({
      data: batch,
      opts: {
        priority: batch.priority,
        jobId: `batch-${batch.batchId}`,
      },
    }));

    return this.sendBatchQueue.addBulk(jobs);
  }

  getBatchQueue(): Queue<SmsBatchJob> {
    return this.sendBatchQueue;
  }

  // ============================================
  // Retry Queue Operations
  // ============================================

  async addRetryJob(data: SmsRetryJob, delayMs: number): Promise<Job<SmsRetryJob>> {
    return this.retryQueue.add(data, {
      delay: delayMs,
      priority: SmsPriority.HIGH, // Retries get higher priority
      jobId: `retry-${data.messageId}-${data.attempt}`,
      attempts: 1, // Retries are already tracked manually
    });
  }

  getRetryQueue(): Queue<SmsRetryJob> {
    return this.retryQueue;
  }

  // ============================================
  // Tracking Queue Operations
  // ============================================

  async addTrackingJob(data: SmsTrackingJob): Promise<Job<SmsTrackingJob>> {
    return this.trackingQueue.add(data, {
      priority: SmsPriority.HIGH,
      jobId: `track-${data.externalId}-${Date.now()}`,
    });
  }

  async addTrackingJobs(events: SmsTrackingJob[]): Promise<Job<SmsTrackingJob>[]> {
    const jobs = events.map((event) => ({
      data: event,
      opts: {
        priority: SmsPriority.HIGH,
        jobId: `track-${event.externalId}-${Date.now()}`,
      },
    }));

    return this.trackingQueue.addBulk(jobs);
  }

  getTrackingQueue(): Queue<SmsTrackingJob> {
    return this.trackingQueue;
  }

  // ============================================
  // Queue Statistics & Monitoring
  // ============================================

  async getQueueStats(): Promise<{
    prepare: QueueStats;
    send: QueueStats;
    sendBatch: QueueStats;
    retry: QueueStats;
    tracking: QueueStats;
  }> {
    const [prepare, send, sendBatch, retry, tracking] = await Promise.all([
      this.getStats(this.prepareQueue),
      this.getStats(this.sendQueue),
      this.getStats(this.sendBatchQueue),
      this.getStats(this.retryQueue),
      this.getStats(this.trackingQueue),
    ]);

    return { prepare, send, sendBatch, retry, tracking };
  }

  private async getStats(queue: Queue): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async pauseAllQueues(): Promise<void> {
    await Promise.all([
      this.prepareQueue.pause(),
      this.sendQueue.pause(),
      this.sendBatchQueue.pause(),
      this.retryQueue.pause(),
      this.trackingQueue.pause(),
    ]);
    this.logger.log('All SMS queues paused');
  }

  async resumeAllQueues(): Promise<void> {
    await Promise.all([
      this.prepareQueue.resume(),
      this.sendQueue.resume(),
      this.sendBatchQueue.resume(),
      this.retryQueue.resume(),
      this.trackingQueue.resume(),
    ]);
    this.logger.log('All SMS queues resumed');
  }

  async cleanOldJobs(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
    const queues = [
      this.prepareQueue,
      this.sendQueue,
      this.sendBatchQueue,
      this.retryQueue,
      this.trackingQueue,
    ];

    for (const queue of queues) {
      await queue.clean(olderThanMs, 'completed');
      await queue.clean(olderThanMs, 'failed');
    }

    this.logger.log(`Cleaned jobs older than ${olderThanMs}ms from all SMS queues`);
  }

  // ============================================
  // Rate Limiting Helpers
  // ============================================

  async getTenantQueueDepth(tenantId: string): Promise<number> {
    const jobs = await this.sendQueue.getJobs(['waiting', 'active']);
    return jobs.filter((job) => job.data.tenantId === tenantId).length;
  }

  async getCampaignQueueDepth(campaignId: string): Promise<number> {
    const jobs = await this.sendQueue.getJobs(['waiting', 'active']);
    return jobs.filter((job) => job.data.campaignId === campaignId).length;
  }
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}
