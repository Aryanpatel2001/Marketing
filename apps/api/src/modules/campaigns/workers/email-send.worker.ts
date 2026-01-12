import { EmailService, SendEmailOptions } from '@/providers/email/email.service';
import {
  EmailRetryMessage,
  EmailSendMessage,
  QUEUES,
  RETRY_CONFIG,
  WORKER_CONFIG,
} from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus, EmailContent } from '../entities/campaign.entity';
import { EmailTrackingService } from '../services/email-tracking.service';

/**
 * HTML escape function to prevent XSS in personalized content
 */
function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
}

@Injectable()
export class EmailSendWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSendWorker.name);
  private readonly sesRateLimit: number;
  private isShuttingDown = false;

  // Campaign cache to reduce DB queries
  private campaignCache = new Map<string, { campaign: Campaign; cachedAt: number }>();
  private readonly campaignCacheTTL = 30000; // 30 seconds

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    private readonly emailService: EmailService,
    private readonly trackingService: EmailTrackingService,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService,
    private readonly cacheService: RedisCacheService,
    private readonly configService: ConfigService
  ) {
    this.sesRateLimit = parseInt(this.configService.get<string>('SES_RATE_LIMIT', '14'), 10);
    this.logger.log(`SES rate limit configured: ${this.sesRateLimit} emails/second`);
  }

  // Batch buffers
  private messageUpdateBuffer: Map<string, Partial<CampaignMessage>> = new Map();
  private eventBuffer: Partial<CampaignEvent>[] = [];
  private campaignStatBuffer: Map<string, { sent: number; failed: number }> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 1000; // 1 second
  private readonly BATCH_SIZE = 100;

  async onModuleInit(): Promise<void> {
    this.startFlushTimer();
    setTimeout(() => this.startConsuming(), 2000);
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('Email Send Worker shutting down gracefully...');

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Allow in-flight messages to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Flush remaining items
    await this.flushBuffers();
  }

  /**
   * Start consuming messages from the email send queue
   */
  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(WORKER_CONFIG.EMAIL_SEND.prefetch);

      await channel.consume(
        QUEUES.EMAIL_SEND.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: EmailSendMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing email send: ${error.message}`, error.stack);
            // Don't requeue - let retry worker handle it
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('Email Send Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Get campaign with caching to reduce DB load
   */
  private async getCampaignCached(campaignId: string, tenantId: string): Promise<Campaign | null> {
    const cacheKey = `${campaignId}:${tenantId}`;
    const cached = this.campaignCache.get(cacheKey);

    // Check if cached and not expired
    if (cached && Date.now() - cached.cachedAt < this.campaignCacheTTL) {
      return cached.campaign;
    }

    // Fetch from database
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (campaign) {
      this.campaignCache.set(cacheKey, { campaign, cachedAt: Date.now() });
    }

    // Clean up old cache entries periodically
    if (this.campaignCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.campaignCache.entries()) {
        if (now - value.cachedAt > this.campaignCacheTTL) {
          this.campaignCache.delete(key);
        }
      }
    }

    return campaign;
  }

  /**
   * Invalidate campaign cache (call when status changes)
   */
  private invalidateCampaignCache(campaignId: string, tenantId: string): void {
    this.campaignCache.delete(`${campaignId}:${tenantId}`);
  }

  /**
   * Process a single email send message
   */
  async processMessage(message: EmailSendMessage): Promise<void> {
    // Check if shutting down
    if (this.isShuttingDown) {
      this.logger.debug('Worker shutting down, requeueing message');
      await this.queueService.publishEmailSend(message);
      return;
    }

    const { campaignId, tenantId, messageId, contactId, email, attempt = 1 } = message;

    this.logger.debug(
      `Processing email for campaign ${campaignId}, message ${messageId}, attempt ${attempt}`
    );

    try {
      // Check campaign status with caching
      const campaign = await this.getCampaignCached(campaignId, tenantId);

      if (!campaign) {
        this.logger.warn(`Campaign ${campaignId} not found, skipping message ${messageId}`);
        return;
      }

      // Check if campaign is still sending
      if (campaign.status === CampaignStatus.PAUSED) {
        this.logger.debug(
          `Campaign ${campaignId} is paused, requeueing message ${messageId} with delay`
        );
        // Put back in queue with 5 second delay to avoid tight loop
        await this.queueService.publishEmailRetry(
          { ...message, attempt } as EmailRetryMessage,
          5000 // 5 second delay for paused campaigns
        );
        return;
      }

      if (campaign.status === CampaignStatus.CANCELLED) {
        this.logger.debug(`Campaign ${campaignId} is cancelled, skipping message ${messageId}`);
        await this.markMessageFailed(messageId, 'Campaign cancelled');
        await this.counterService.incrFailed(campaignId);
        return;
      }

      if (campaign.status !== CampaignStatus.SENDING) {
        this.logger.warn(`Campaign ${campaignId} is in ${campaign.status} status, skipping`);
        return;
      }

      // Check SES rate limit using configurable value
      const withinRateLimit = await this.counterService.checkSESRateLimit(this.sesRateLimit);
      if (!withinRateLimit) {
        this.logger.debug(`SES rate limit reached, sleeping...`);
        // Sleep for a short duration instead of requeueing to reduce queue churn
        // Random sleep between 100-500ms
        const sleepTime = 100 + Math.random() * 400;
        await new Promise((resolve) => setTimeout(resolve, sleepTime));

        // Double check after sleep, if still limited then maybe requeue or just proceed (leaky bucket)
        // For now, we proceed as the sleep should have spaced it out enough
      }

      // Mark message as sending
      await this.messageRepository.update(messageId, {
        status: MessageStatus.SENDING,
      });

      // Get content and personalize
      const content = campaign.content as EmailContent;
      const personalizedSubject = this.personalizeContent(content.subject, message);
      let personalizedHtml = this.personalizeContent(content.htmlContent, message);

      // Add tracking
      personalizedHtml = this.trackingService.processEmailForTracking(
        personalizedHtml,
        messageId,
        campaignId,
        contactId,
        tenantId,
        {
          trackOpens: true,
          trackClicks: true,
          addUnsubscribe: true,
        }
      );

      // Build email options
      const emailOptions: SendEmailOptions = {
        to: email,
        from: content.fromEmail,
        fromName: content.fromName,
        replyTo: content.replyTo,
        subject: personalizedSubject,
        html: personalizedHtml,
      };

      // Send email
      const result = await this.emailService.sendEmail(emailOptions);

      if (result.success) {
        await this.handleSuccess(
          messageId,
          campaignId,
          contactId,
          tenantId,
          email,
          result.messageId,
          {
            subject: personalizedSubject,
            fromName: content.fromName,
            fromEmail: content.fromEmail,
          }
        );
      } else {
        await this.handleFailure(message, result.error || 'Unknown error', campaign);
      }
    } catch (error: any) {
      this.logger.error(`Error sending email for message ${messageId}: ${error.message}`);
      await this.handleFailure(message, error.message);
    }
  }

  /**
   * Handle successful email send
   */
  private async handleSuccess(
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string,
    email: string,
    externalId?: string,
    renderedContent?: Record<string, string>
  ): Promise<void> {
    const sentAt = new Date();

    // Buffer message update
    this.bufferMessageUpdate(messageId, {
      status: MessageStatus.SENT,
      sentAt,
      externalId,
      renderedContent,
    });

    // Buffer event
    this.eventBuffer.push({
      campaignMessageId: messageId,
      campaignId,
      contactId,
      tenantId,
      eventType: EventType.SENT,
      createdAt: sentAt,
    });

    // Buffer stats increment
    this.bufferStatIncrement(campaignId, 'sent');

    // Increment Redis counter (still do this immediately for real-time stats)
    await this.counterService.incrSent(campaignId);

    // Log successful email send with timestamp
    this.logger.log(
      `[EMAIL SENT] Campaign: ${campaignId} | To: ${email} | MessageID: ${messageId} | SES-ID: ${externalId || 'N/A'} | Timestamp: ${sentAt.toISOString()}`
    );

    // Check and update campaign completion
    await this.checkCampaignCompletion(campaignId);
  }

  /**
   * Handle failed email send
   */
  private async handleFailure(
    message: EmailSendMessage,
    error: string,
    _campaign?: Campaign
  ): Promise<void> {
    const { campaignId, messageId, email, attempt = 1 } = message;
    const failedAt = new Date();

    this.logger.warn(
      `[EMAIL FAILED] Campaign: ${campaignId} | To: ${email} | MessageID: ${messageId} | ` +
        `Attempt: ${attempt} | Error: ${error} | Timestamp: ${failedAt.toISOString()}`
    );

    // Check if we should retry
    if (attempt < RETRY_CONFIG.EMAIL.maxRetries && this.isRetryableError(error)) {
      const delayMs = this.calculateBackoff(attempt);

      this.logger.debug(`Scheduling retry ${attempt + 1} for message ${messageId} in ${delayMs}ms`);

      await this.queueService.publishEmailRetry(
        {
          ...message,
          attempt: attempt + 1,
          lastError: error,
          nextRetryAt: new Date(Date.now() + delayMs),
        },
        delayMs
      );

      // Update retry count
      await this.messageRepository.update(messageId, {
        retryCount: attempt,
        errorMessage: error,
      });
    } else {
      // Mark as permanently failed
      await this.markMessageFailed(messageId, error);

      this.bufferStatIncrement(campaignId, 'failed');
      await this.counterService.incrFailed(campaignId);

      // Create failed event
      this.eventBuffer.push({
        campaignMessageId: messageId,
        campaignId,
        contactId: message.contactId,
        tenantId: message.tenantId,
        eventType: EventType.FAILED,
        metadata: { error },
        createdAt: failedAt,
      });

      // Check campaign completion
      await this.checkCampaignCompletion(campaignId);
    }
  }

  /**
   * Mark message as failed
   */
  private async markMessageFailed(messageId: string, error: string): Promise<void> {
    this.bufferMessageUpdate(messageId, {
      status: MessageStatus.FAILED,
      failedAt: new Date(),
      errorMessage: error,
    });
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
      'ECONNREFUSED',
    ];

    const lowerError = error.toLowerCase();
    return retryablePatterns.some((pattern) => lowerError.includes(pattern.toLowerCase()));
  }

  /**
   * Calculate exponential backoff
   */
  private calculateBackoff(attempt: number): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier } = RETRY_CONFIG.EMAIL;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    const jitter = delay * Math.random() * 0.25;
    return Math.min(delay + jitter, maxDelayMs);
  }

  /**
   * Personalize content with contact data
   */
  private personalizeContent(content: string, message: EmailSendMessage): string {
    if (!content) return content;

    const replacements: Record<string, string> = {
      first_name: escapeHtml(message.firstName || ''),
      last_name: escapeHtml(message.lastName || ''),
      full_name: escapeHtml([message.firstName, message.lastName].filter(Boolean).join(' ') || ''),
      email: escapeHtml(message.email || ''),
    };

    // Add custom fields
    if (message.customFields) {
      Object.entries(message.customFields).forEach(([key, value]) => {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          replacements[key.toLowerCase()] = escapeHtml(String(value || ''));
        }
      });
    }

    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return replacements[variable.toLowerCase()] || match;
    });
  }

  /**
   * Check if campaign is complete (with distributed lock to prevent race conditions)
   */
  private async checkCampaignCompletion(campaignId: string): Promise<void> {
    try {
      // Get stats from Redis
      const stats = await this.counterService.getCampaignStats(campaignId);
      if (!stats) return;

      // Get campaign from cache
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== CampaignStatus.SENDING) return;

      const processed = stats.sent + stats.failed;
      const total = campaign.totalRecipients;

      // Update progress in cache
      await this.cacheService.setCampaignProgress(campaignId, {
        sent: stats.sent,
        failed: stats.failed,
        total,
        status: 'sending',
      });

      // Check if complete
      if (processed >= total) {
        // Acquire lock to prevent multiple workers from completing the same campaign
        const lockAcquired = await this.counterService.acquireLock(`complete:${campaignId}`, 60);
        if (!lockAcquired) {
          this.logger.debug(`Campaign ${campaignId} completion already being processed`);
          return;
        }

        try {
          // Double-check campaign status after acquiring lock
          const currentCampaign = await this.campaignRepository.findOne({
            where: { id: campaignId },
          });

          if (!currentCampaign || currentCampaign.status !== CampaignStatus.SENDING) {
            return;
          }

          const completedAt = new Date();
          this.logger.log(
            `[CAMPAIGN COMPLETED] ID: ${campaignId} | Sent: ${stats.sent} | Failed: ${stats.failed} | ` +
              `Total: ${total} | CompletedAt: ${completedAt.toISOString()}`
          );

          // Update campaign
          await this.campaignRepository.update(campaignId, {
            status: CampaignStatus.SENT,
            completedAt,
            sentCount: stats.sent,
            failedCount: stats.failed,
          });

          // Invalidate campaign cache
          this.invalidateCampaignCache(campaignId, campaign.tenantId);

          // Update cache
          await this.cacheService.setCampaignProgress(campaignId, {
            sent: stats.sent,
            failed: stats.failed,
            total,
            status: 'sent',
          });

          // Publish complete event
          await this.queueService.publishCampaignComplete(campaignId, campaign.tenantId);
        } finally {
          await this.counterService.releaseLock(`complete:${campaignId}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error checking campaign completion: ${error.message}`);
    }
  }

  // ==================== Batching Implementation ====================

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffers().catch((err) =>
        this.logger.error(`Error flushing buffers: ${err.message}`, err.stack)
      );
    }, this.FLUSH_INTERVAL);
  }

  private bufferMessageUpdate(messageId: string, update: Partial<CampaignMessage>): void {
    this.messageUpdateBuffer.set(messageId, {
      ...(this.messageUpdateBuffer.get(messageId) || {}),
      ...update,
    });

    if (this.messageUpdateBuffer.size >= this.BATCH_SIZE) {
      this.flushBuffers();
    }
  }

  private bufferStatIncrement(campaignId: string, type: 'sent' | 'failed'): void {
    const current = this.campaignStatBuffer.get(campaignId) || { sent: 0, failed: 0 };
    if (type === 'sent') current.sent++;
    if (type === 'failed') current.failed++;
    this.campaignStatBuffer.set(campaignId, current);
  }

  private async flushBuffers(): Promise<void> {
    if (
      this.messageUpdateBuffer.size === 0 &&
      this.eventBuffer.length === 0 &&
      this.campaignStatBuffer.size === 0
    ) {
      return;
    }

    const messagesToUpdate = new Map(this.messageUpdateBuffer);
    const eventsToInsert = [...this.eventBuffer];
    const _statsToSync = new Map(this.campaignStatBuffer);

    this.messageUpdateBuffer.clear();
    this.eventBuffer = [];
    this.campaignStatBuffer.clear();

    try {
      // 1. Bulk update messages
      // Note: TypeORM doesn't support bulk update with different values well,
      // so we'll execute raw queries or promises for now.
      // For true high performance, we'd build a single large CASE query.
      if (messagesToUpdate.size > 0) {
        const updatePromises = Array.from(messagesToUpdate.entries()).map(([id, data]) =>
          this.messageRepository.update(id, data as any)
        );
        await Promise.all(updatePromises);
        this.logger.debug(`Flushed ${messagesToUpdate.size} message updates`);
      }

      // 2. Bulk insert events
      if (eventsToInsert.length > 0) {
        // Process in chunks of 50 to avoid parameter limits
        const chunkSize = 50;
        for (let i = 0; i < eventsToInsert.length; i += chunkSize) {
          const chunk = eventsToInsert.slice(i, i + chunkSize);
          await this.eventRepository.save(chunk);
        }
        this.logger.debug(`Flushed ${eventsToInsert.length} events`);
      }

      // 3. Sync stats to DB eventually (if needed, but we rely on Redis for real-time)
      // We might want to persist these to DB periodically so we don't lose them if Redis crashes
      // But for now, we leave the DB sync to the campaign completion check or separate sync service.
    } catch (error: any) {
      this.logger.error(`Failed to flush buffers: ${error.message}`, error.stack);
      // In a real robust system, we would put these back into the buffer or a DLQ
      // For now, we log the error.
    }
  }
}
