import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import { Repository } from 'typeorm';

import { BatchMessage, BatchSmsService } from '@/modules/sms/services/batch-sms.service';
import {
  BullSmsQueueService,
  SmsBatchJob,
  SmsMessageJob,
  SmsPriority,
} from '@/providers/queue/bull-sms-queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';

import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';

@Injectable()
export class SmsBatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsBatchWorker.name);

  private readonly concurrency: number;
  private readonly apiUrl: string;
  private isShuttingDown = false;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    private readonly bullSmsQueue: BullSmsQueueService,
    private readonly batchSmsService: BatchSmsService,
    private readonly cacheService: RedisCacheService,
    private readonly counterService: RedisCounterService,
    private readonly configService: ConfigService
  ) {
    this.concurrency = this.configService.get<number>('SMS_WORKER_CONCURRENCY', 5);
    this.apiUrl = this.configService.get<string>('API_URL', '');
  }

  async onModuleInit() {
    // Retry initialization with exponential backoff
    // This handles the case where BullSmsQueueService might not be initialized yet
    let retries = 0;
    const maxRetries = 10;
    const baseDelay = 100; // ms

    while (retries < maxRetries) {
      try {
        await this.startProcessing();
        this.logger.log(`SMS Batch Worker started with concurrency: ${this.concurrency}`);
        return;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          this.logger.error(
            `Failed to initialize SMS Batch Worker after ${maxRetries} attempts: ${error.message}`
          );
          throw error;
        }
        const delay = baseDelay * Math.pow(2, retries - 1);
        this.logger.warn(
          `Queue not ready, retrying in ${delay}ms (attempt ${retries}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    this.logger.log('SMS Batch Worker shutting down...');
    // Give time for in-flight jobs to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  /**
   * Start processing batch jobs
   */
  private async startProcessing(): Promise<void> {
    const batchQueue = this.bullSmsQueue.getBatchQueue();
    const sendQueue = this.bullSmsQueue.getSendQueue();

    // Check if queues are initialized
    if (!batchQueue) {
      throw new Error('Batch queue is not initialized');
    }

    if (!sendQueue) {
      throw new Error('Send queue is not initialized');
    }

    // Process batch jobs
    batchQueue.process(this.concurrency, async (job: Job<SmsBatchJob>) => {
      return this.processBatchJob(job);
    });

    // Set up event handlers
    batchQueue.on('completed', (job, result) => {
      this.logger.log(
        `Batch job ${job.id} completed: ${result.successful}/${result.totalMessages} sent`
      );
    });

    batchQueue.on('failed', (job, error) => {
      this.logger.error(`Batch job ${job.id} failed: ${error.message}`);
    });

    batchQueue.on('stalled', (job) => {
      this.logger.warn(`Batch job ${job.id} stalled, will be reprocessed`);
    });

    // Also process individual send jobs for retries and single messages
    sendQueue.process(this.concurrency * 10, async (job: Job<SmsMessageJob>) => {
      return this.processSingleJob(job);
    });

    this.logger.log('SMS Batch Worker processors registered');
  }

  /**
   * Process a batch of SMS messages
   */
  private async processBatchJob(job: Job<SmsBatchJob>): Promise<{
    batchId: string;
    totalMessages: number;
    successful: number;
    failed: number;
  }> {
    const { batchId, campaignId, tenantId, messages } = job.data;

    this.logger.log(
      `[BATCH ${batchId}] Processing ${messages.length} messages for campaign ${campaignId}`
    );

    // Check if campaign is still in sending state
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      this.logger.warn(`Campaign ${campaignId} not found, skipping batch ${batchId}`);
      return { batchId, totalMessages: messages.length, successful: 0, failed: messages.length };
    }

    if (campaign.status === CampaignStatus.CANCELLED) {
      this.logger.warn(`Campaign ${campaignId} cancelled, skipping batch ${batchId}`);
      await this.markBatchCancelled(messages);
      return { batchId, totalMessages: messages.length, successful: 0, failed: 0 };
    }

    if (campaign.status === CampaignStatus.PAUSED) {
      // Re-queue the batch with a delay
      this.logger.log(`Campaign ${campaignId} paused, re-queueing batch ${batchId}`);
      await this.bullSmsQueue.addBatchJob({ ...job.data, priority: SmsPriority.LOW });
      return { batchId, totalMessages: messages.length, successful: 0, failed: 0 };
    }

    // Convert to BatchMessage format
    const batchMessages: BatchMessage[] = messages.map((msg) => ({
      messageId: msg.messageId,
      campaignId: msg.campaignId,
      tenantId: msg.tenantId,
      contactId: msg.contactId,
      phoneNumber: msg.phoneNumber,
      content: msg.content,
      senderId: msg.senderId,
      firstName: msg.firstName,
      lastName: msg.lastName,
      customFields: msg.customFields,
    }));

    // Send batch
    const result = await this.batchSmsService.sendBatch(batchMessages, batchId, this.apiUrl);

    // Update message statuses
    await this.batchSmsService.updateMessageStatuses(result.results, campaignId);

    // Create events for tracking
    await this.createBatchEvents(result.results, campaignId, tenantId);

    // Update campaign progress cache
    await this.updateCampaignProgress(campaignId, result.successful, result.failed);

    // Check if campaign is complete
    await this.checkCampaignCompletion(campaignId);

    // Update job progress
    await job.progress(100);

    return {
      batchId,
      totalMessages: result.totalMessages,
      successful: result.successful,
      failed: result.failed,
    };
  }

  /**
   * Process a single SMS message (for retries)
   */
  private async processSingleJob(job: Job<SmsMessageJob>): Promise<{ success: boolean }> {
    const message = job.data;

    const batchMessage: BatchMessage = {
      messageId: message.messageId,
      campaignId: message.campaignId,
      tenantId: message.tenantId,
      contactId: message.contactId,
      phoneNumber: message.phoneNumber,
      content: message.content,
      senderId: message.senderId,
      firstName: message.firstName,
      lastName: message.lastName,
      customFields: message.customFields,
    };

    const result = await this.batchSmsService.sendBatch(
      [batchMessage],
      `single-${message.messageId}`,
      this.apiUrl
    );

    const sendResult = result.results[0];

    if (sendResult.success) {
      await this.messageRepository.update(message.messageId, {
        status: MessageStatus.SENT,
        sentAt: new Date(),
        externalId: sendResult.externalId,
      });
      await this.counterService.incrSent(message.campaignId);
    } else {
      // Check if should retry
      const attempt = message.attempt || 1;
      if (attempt < 3 && this.isRetryableError(sendResult.error || '')) {
        // Re-queue with delay
        await this.bullSmsQueue.addSendJob({ ...message, attempt: attempt + 1 }, SmsPriority.HIGH);
      } else {
        // Mark as failed
        await this.messageRepository.update(message.messageId, {
          status: MessageStatus.FAILED,
          failedAt: new Date(),
          errorMessage: sendResult.error,
        });
        await this.counterService.incrFailed(message.campaignId);
      }
    }

    return { success: sendResult.success };
  }

  /**
   * Mark batch messages as cancelled
   */
  private async markBatchCancelled(messages: SmsMessageJob[]): Promise<void> {
    const messageIds = messages.map((m) => m.messageId);

    await this.messageRepository
      .createQueryBuilder()
      .update(CampaignMessage)
      .set({ status: MessageStatus.FAILED, errorMessage: 'Campaign cancelled' })
      .whereInIds(messageIds)
      .execute();
  }

  /**
   * Create batch events for tracking
   */
  private async createBatchEvents(
    results: Array<{ messageId: string; success: boolean; externalId?: string; error?: string }>,
    campaignId: string,
    tenantId: string
  ): Promise<void> {
    const events = results.map((result) => ({
      campaignMessageId: result.messageId,
      campaignId,
      tenantId,
      eventType: result.success ? EventType.SENT : EventType.FAILED,
      metadata: result.success ? { externalId: result.externalId } : { error: result.error },
      createdAt: new Date(),
    }));

    // Insert in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      await this.eventRepository.save(batch);
    }
  }

  /**
   * Update campaign progress in cache
   */
  private async updateCampaignProgress(
    campaignId: string,
    _sent: number,
    _failed: number
  ): Promise<void> {
    const stats = await this.counterService.getCampaignStats(campaignId);
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });

    if (campaign && stats) {
      await this.cacheService.setCampaignProgress(campaignId, {
        sent: stats.sent,
        failed: stats.failed,
        total: campaign.totalRecipients,
        status: 'sending',
      });
    }
  }

  /**
   * Check if campaign is complete
   */
  private async checkCampaignCompletion(campaignId: string): Promise<void> {
    const stats = await this.counterService.getCampaignStats(campaignId);
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });

    if (!campaign || !stats) return;

    const processed = stats.sent + stats.failed;
    const total = campaign.totalRecipients;

    if (processed >= total) {
      // Try to acquire lock for completion
      const lockAcquired = await this.counterService.acquireLock(`complete:sms:${campaignId}`, 60);
      if (!lockAcquired) return;

      try {
        // Re-check after acquiring lock
        const currentCampaign = await this.campaignRepository.findOne({
          where: { id: campaignId },
        });
        if (!currentCampaign || currentCampaign.status !== CampaignStatus.SENDING) return;

        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.SENT,
          completedAt: new Date(),
          sentCount: stats.sent,
          failedCount: stats.failed,
        });

        await this.cacheService.setCampaignProgress(campaignId, {
          sent: stats.sent,
          failed: stats.failed,
          total,
          status: 'sent',
        });

        this.logger.log(
          `[CAMPAIGN COMPLETE] ${campaignId}: ${stats.sent} sent, ${stats.failed} failed`
        );
      } finally {
        await this.counterService.releaseLock(`complete:sms:${campaignId}`);
      }
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'throttling',
      'rate limit',
      'timeout',
      'temporarily unavailable',
      'service unavailable',
      'connection',
      'network',
      'ETIMEDOUT',
      'ECONNRESET',
      'busy',
    ];

    const lowerError = error.toLowerCase();
    return retryablePatterns.some((pattern) => lowerError.includes(pattern));
  }

  /**
   * Get worker stats
   */
  async getWorkerStats(): Promise<{
    queues: any;
    batchServiceStats: any;
  }> {
    const queues = await this.bullSmsQueue.getQueueStats();
    const batchServiceStats = this.batchSmsService.getStats();

    return {
      queues,
      batchServiceStats,
    };
  }
}
