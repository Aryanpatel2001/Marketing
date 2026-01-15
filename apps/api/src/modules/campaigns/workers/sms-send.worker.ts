import { WalletService } from '@/modules/billing/services/wallet.service';
import { SmsSender, SmsSenderType } from '@/modules/sms/entities/sms-sender.entity';
import { SenderService } from '@/modules/sms/services/sender.service';
import {
  QUEUES,
  RETRY_CONFIG,
  SmsRetryMessage,
  SmsSendMessage,
  WORKER_CONFIG,
} from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { SmsService } from '@/providers/sms/sms.service';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus, SmsContent } from '../entities/campaign.entity';

@Injectable()
export class SmsSendWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsSendWorker.name);
  private readonly smsRateLimit: number;
  private isShuttingDown = false;

  private campaignCache = new Map<string, { campaign: Campaign; cachedAt: number }>();
  private senderCache = new Map<string, { sender: SmsSender | null; cachedAt: number }>();
  private readonly campaignCacheTTL = 30000;
  private readonly senderCacheTTL = 60000; // 1 minute cache for senders

  private messageUpdateBuffer: Map<string, Partial<CampaignMessage>> = new Map();
  private eventBuffer: Partial<CampaignEvent>[] = [];
  private campaignStatBuffer: Map<string, { sent: number; failed: number }> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 1000;
  private readonly BATCH_SIZE = 100;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    private readonly smsService: SmsService,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService,
    private readonly cacheService: RedisCacheService,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly senderService: SenderService
  ) {
    this.smsRateLimit = parseInt(this.configService.get<string>('SMS_RATE_LIMIT', '10'), 10);
    this.logger.log(`SMS rate limit configured: ${this.smsRateLimit} messages/second`);
  }

  async onModuleInit(): Promise<void> {
    this.startFlushTimer();
    setTimeout(() => this.startConsuming(), 2000);
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('SMS Send Worker shutting down gracefully...');

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await this.flushBuffers();
  }

  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(WORKER_CONFIG.SMS_SEND.prefetch);

      await channel.consume(
        QUEUES.SMS_SEND.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: SmsSendMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing SMS send: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('SMS Send Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  private async getCampaignCached(campaignId: string, tenantId: string): Promise<Campaign | null> {
    const cacheKey = `${campaignId}:${tenantId}`;
    const cached = this.campaignCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < this.campaignCacheTTL) {
      return cached.campaign;
    }

    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (campaign) {
      this.campaignCache.set(cacheKey, { campaign, cachedAt: Date.now() });
    }

    return campaign;
  }

  private async getSenderCached(tenantId: string, senderId?: string): Promise<SmsSender | null> {
    const cacheKey = `${tenantId}:${senderId || 'default'}`;
    const cached = this.senderCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < this.senderCacheTTL) {
      return cached.sender;
    }

    let sender: SmsSender | null = null;

    if (senderId) {
      // Get specific sender
      try {
        sender = await this.senderService.getSender(tenantId, senderId);
      } catch {
        // Fall through to default sender
      }
    }

    if (!sender) {
      // Get default sender for tenant
      sender = await this.senderService.getDefaultSender(tenantId);
    }

    this.senderCache.set(cacheKey, { sender, cachedAt: Date.now() });
    return sender;
  }

  private getFromAddress(sender: SmsSender | null, contentSenderId?: string): string | undefined {
    if (sender) {
      // Return phone number or sender ID based on sender type
      if (sender.type === SmsSenderType.SENDER_ID && sender.senderId) {
        return sender.senderId;
      }
      if (sender.phoneNumber) {
        return sender.phoneNumber;
      }
    }
    // Fall back to content sender ID if no sender configured
    return contentSenderId || undefined;
  }

  async processMessage(message: SmsSendMessage): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug('Worker shutting down, requeueing message');
      await this.queueService.publishSmsSend(message);
      return;
    }

    const { campaignId, tenantId, messageId, contactId, phoneNumber, attempt = 1 } = message;

    try {
      const campaign = await this.getCampaignCached(campaignId, tenantId);

      if (!campaign) {
        this.logger.warn(`Campaign ${campaignId} not found, skipping message ${messageId}`);
        return;
      }

      if (campaign.status === CampaignStatus.PAUSED) {
        await this.queueService.publishSmsRetry({ ...message, attempt } as SmsRetryMessage, 5000);
        return;
      }

      if (campaign.status === CampaignStatus.CANCELLED) {
        await this.markMessageFailed(messageId, 'Campaign cancelled');
        await this.counterService.incrFailed(campaignId);
        return;
      }

      if (campaign.status !== CampaignStatus.SENDING) {
        this.logger.warn(`Campaign ${campaignId} is in ${campaign.status} status, skipping`);
        return;
      }

      // Check wallet balance before sending
      const hasBalance = await this.walletService.hasBalance(tenantId, 1);
      if (!hasBalance) {
        this.logger.warn(
          `Insufficient credits for tenant ${tenantId}, pausing campaign ${campaignId}`
        );
        await this.markMessageFailed(messageId, 'Insufficient credits');
        await this.counterService.incrFailed(campaignId);

        // Pause the campaign due to insufficient credits
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.PAUSED,
        });

        return;
      }

      await this.messageRepository.update(messageId, {
        status: MessageStatus.SENDING,
      });

      const content = campaign.content as SmsContent;
      const personalizedBody = this.personalizeContent(content.message, message);

      // Get the sender for this tenant
      const sender = await this.getSenderCached(tenantId, content.senderId);
      const fromAddress = this.getFromAddress(sender, content.senderId);

      if (!fromAddress) {
        this.logger.warn(`No sender configured for tenant ${tenantId}, message ${messageId}`);
        await this.handleFailure(
          message,
          'No SMS sender configured. Please purchase or configure a sender.'
        );
        return;
      }

      const apiUrl = this.configService.get<string>('API_URL');
      const statusCallback = apiUrl
        ? `${apiUrl}/api/sms/webhook/delivery?tenantId=${tenantId}&campaignId=${campaignId}`
        : undefined;

      const result = await this.smsService.sendSms({
        to: phoneNumber,
        from: fromAddress,
        message: personalizedBody,
        statusCallback,
      });

      if (result.success) {
        // Update sender metrics
        if (sender) {
          this.senderService.updateSenderMetrics(sender.id, true).catch((err) => {
            this.logger.warn(`Failed to update sender metrics: ${err.message}`);
          });
        }

        await this.handleSuccess(
          messageId,
          campaignId,
          contactId,
          tenantId,
          phoneNumber,
          result.messageId,
          {
            body: personalizedBody,
            senderId: fromAddress,
          }
        );
      } else {
        // Update sender metrics for failure
        if (sender) {
          this.senderService.updateSenderMetrics(sender.id, false).catch((err) => {
            this.logger.warn(`Failed to update sender metrics: ${err.message}`);
          });
        }

        await this.handleFailure(message, result.error || 'Unknown error');
      }
    } catch (error: any) {
      this.logger.error(`Error sending SMS for message ${messageId}: ${error.message}`);
      await this.handleFailure(message, error.message);
    }
  }

  private async handleSuccess(
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string,
    phoneNumber: string,
    externalId?: string,
    renderedContent?: Record<string, string>
  ): Promise<void> {
    const sentAt = new Date();

    // Deduct credit for successful SMS send
    try {
      await this.walletService.deductCredits(tenantId, 1, campaignId, messageId);
    } catch (error: any) {
      this.logger.error(`Failed to deduct credit for message ${messageId}: ${error.message}`);
      // Continue even if credit deduction fails - we'll reconcile later
    }

    this.bufferMessageUpdate(messageId, {
      status: MessageStatus.SENT,
      sentAt,
      externalId,
      renderedContent,
    });

    this.eventBuffer.push({
      campaignMessageId: messageId,
      campaignId,
      contactId,
      tenantId,
      eventType: EventType.SENT,
      createdAt: sentAt,
    });

    this.bufferStatIncrement(campaignId, 'sent');
    await this.counterService.incrSent(campaignId);

    this.logger.log(
      `[SMS SENT] Campaign: ${campaignId} | To: ${phoneNumber} | MessageID: ${messageId} | ExtID: ${externalId || 'N/A'}`
    );

    await this.checkCampaignCompletion(campaignId);
  }

  private async handleFailure(message: SmsSendMessage, error: string): Promise<void> {
    const { campaignId, messageId, phoneNumber, attempt = 1 } = message;
    const failedAt = new Date();

    this.logger.warn(
      `[SMS FAILED] Campaign: ${campaignId} | To: ${phoneNumber} | MessageID: ${messageId} | Attempt: ${attempt} | Error: ${error}`
    );

    if (attempt < RETRY_CONFIG.SMS.maxRetries && this.isRetryableError(error)) {
      const delayMs = this.calculateBackoff(attempt);

      await this.queueService.publishSmsRetry(
        {
          ...message,
          attempt: attempt + 1,
          lastError: error,
          nextRetryAt: new Date(Date.now() + delayMs),
        },
        delayMs
      );

      await this.messageRepository.update(messageId, {
        retryCount: attempt,
        errorMessage: error,
      });
    } else {
      await this.markMessageFailed(messageId, error);
      this.bufferStatIncrement(campaignId, 'failed');
      await this.counterService.incrFailed(campaignId);

      this.eventBuffer.push({
        campaignMessageId: messageId,
        campaignId,
        contactId: message.contactId,
        tenantId: message.tenantId,
        eventType: EventType.FAILED,
        metadata: { error },
        createdAt: failedAt,
      });

      await this.checkCampaignCompletion(campaignId);
    }
  }

  private async markMessageFailed(messageId: string, error: string): Promise<void> {
    this.bufferMessageUpdate(messageId, {
      status: MessageStatus.FAILED,
      failedAt: new Date(),
      errorMessage: error,
    });
  }

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
      'busy',
      'queue overflow',
    ];

    const lowerError = error.toLowerCase();
    return retryablePatterns.some((pattern) => lowerError.includes(pattern.toLowerCase()));
  }

  private calculateBackoff(attempt: number): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier } = RETRY_CONFIG.SMS;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    const jitter = delay * Math.random() * 0.25;
    return Math.min(delay + jitter, maxDelayMs);
  }

  private personalizeContent(content: string, message: SmsSendMessage): string {
    if (!content) return content;

    const replacements: Record<string, string> = {
      first_name: message.firstName || '',
      last_name: message.lastName || '',
      full_name: [message.firstName, message.lastName].filter(Boolean).join(' ') || '',
      phone: message.phoneNumber || '',
    };

    if (message.customFields) {
      Object.entries(message.customFields).forEach(([key, value]) => {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          replacements[key.toLowerCase()] = String(value || '');
        }
      });
    }

    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return replacements[variable.toLowerCase()] || match;
    });
  }

  private async checkCampaignCompletion(campaignId: string): Promise<void> {
    try {
      const stats = await this.counterService.getCampaignStats(campaignId);
      if (!stats) return;

      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== CampaignStatus.SENDING) return;

      const processed = stats.sent + stats.failed;
      const total = campaign.totalRecipients;

      await this.cacheService.setCampaignProgress(campaignId, {
        sent: stats.sent,
        failed: stats.failed,
        total,
        status: 'sending',
      });

      if (processed >= total) {
        const lockAcquired = await this.counterService.acquireLock(
          `complete:sms:${campaignId}`,
          60
        );
        if (!lockAcquired) return;

        try {
          const currentCampaign = await this.campaignRepository.findOne({
            where: { id: campaignId },
          });

          if (!currentCampaign || currentCampaign.status !== CampaignStatus.SENDING) return;

          const completedAt = new Date();
          await this.campaignRepository.update(campaignId, {
            status: CampaignStatus.SENT,
            completedAt,
            sentCount: stats.sent,
            failedCount: stats.failed,
          });

          await this.cacheService.setCampaignProgress(campaignId, {
            sent: stats.sent,
            failed: stats.failed,
            total,
            status: 'sent',
          });

          await this.queueService.publishCampaignComplete(campaignId, campaign.tenantId);
        } finally {
          await this.counterService.releaseLock(`complete:sms:${campaignId}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error checking SMS campaign completion: ${error.message}`);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffers().catch((err) =>
        this.logger.error(`Error flushing SMS buffers: ${err.message}`)
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

    this.messageUpdateBuffer.clear();
    this.eventBuffer = [];
    this.campaignStatBuffer.clear();

    try {
      if (messagesToUpdate.size > 0) {
        const updatePromises = Array.from(messagesToUpdate.entries()).map(([id, data]) =>
          this.messageRepository.update(id, data as any)
        );
        await Promise.all(updatePromises);
      }

      if (eventsToInsert.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < eventsToInsert.length; i += chunkSize) {
          const chunk = eventsToInsert.slice(i, i + chunkSize);
          await this.eventRepository.save(chunk);
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to flush SMS buffers: ${error.message}`);
    }
  }
}
