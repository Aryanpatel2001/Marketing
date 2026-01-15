import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import pMap from 'p-map';

import {
  CampaignMessage,
  MessageStatus,
} from '@/modules/campaigns/entities/campaign-message.entity';
import { SmsService } from '@/providers/sms/sms.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { WalletService } from '@/modules/billing/services/wallet.service';
import { SenderService } from './sender.service';
import { SmsSender, SmsSenderType } from '../entities/sms-sender.entity';

export interface BatchMessage {
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
}

export interface BatchResult {
  messageId: string;
  success: boolean;
  externalId?: string;
  error?: string;
  segments?: number;
  cost?: number;
}

export interface BatchSendResult {
  batchId: string;
  totalMessages: number;
  successful: number;
  failed: number;
  results: BatchResult[];
  durationMs: number;
}

interface SenderCache {
  sender: SmsSender | null;
  cachedAt: number;
}

@Injectable()
export class BatchSmsService {
  private readonly logger = new Logger(BatchSmsService.name);

  // Configuration
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly senderCacheTTL = 60000; // 1 minute

  // In-memory caches
  private senderCache = new Map<string, SenderCache>();

  constructor(
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    private readonly smsService: SmsService,
    private readonly senderService: SenderService,
    private readonly walletService: WalletService,
    private readonly counterService: RedisCounterService,
    private readonly cacheService: RedisCacheService,
    private readonly configService: ConfigService
  ) {
    this.batchSize = this.configService.get<number>('SMS_BATCH_SIZE', 100);
    this.concurrency = this.configService.get<number>('SMS_CONCURRENCY', 50);

    this.logger.log(
      `BatchSmsService initialized: batchSize=${this.batchSize}, concurrency=${this.concurrency}`
    );
  }

  /**
   * Send a batch of SMS messages in parallel
   */
  async sendBatch(
    messages: BatchMessage[],
    batchId: string,
    apiUrl?: string
  ): Promise<BatchSendResult> {
    const startTime = Date.now();
    this.logger.log(`[BATCH ${batchId}] Starting batch send of ${messages.length} messages`);

    // Pre-fetch senders for all unique tenants
    const tenantIds = [...new Set(messages.map((m) => m.tenantId))];
    await this.prefetchSenders(tenantIds, messages);

    // Send messages in parallel with controlled concurrency
    const results = await pMap(
      messages,
      async (message) => this.sendSingleMessage(message, apiUrl),
      { concurrency: this.concurrency }
    );

    // Calculate stats
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[BATCH ${batchId}] Completed: ${successful}/${messages.length} successful, ` +
        `${failed} failed, ${durationMs}ms (${Math.round(messages.length / (durationMs / 1000))} msg/sec)`
    );

    return {
      batchId,
      totalMessages: messages.length,
      successful,
      failed,
      results,
      durationMs,
    };
  }

  /**
   * Send a single SMS message
   */
  private async sendSingleMessage(message: BatchMessage, apiUrl?: string): Promise<BatchResult> {
    const { messageId, campaignId, tenantId, phoneNumber, content, senderId } = message;

    try {
      // Check wallet balance
      const hasBalance = await this.walletService.hasBalance(tenantId, 1);
      if (!hasBalance) {
        return {
          messageId,
          success: false,
          error: 'Insufficient credits',
        };
      }

      // Get sender
      const sender = await this.getCachedSender(tenantId, senderId);
      const fromAddress = this.getFromAddress(sender, senderId);

      if (!fromAddress) {
        return {
          messageId,
          success: false,
          error: 'No SMS sender configured',
        };
      }

      // Personalize content
      const personalizedContent = this.personalizeContent(content, message);

      // Build status callback URL
      const statusCallback = apiUrl
        ? `${apiUrl}/api/sms/webhook/delivery?tenantId=${tenantId}&campaignId=${campaignId}`
        : undefined;

      // Send SMS
      const result = await this.smsService.sendSms({
        to: phoneNumber,
        from: fromAddress,
        message: personalizedContent,
        statusCallback,
      });

      if (result.success) {
        // Deduct credit
        await this.walletService.deductCredits(tenantId, 1, campaignId, messageId).catch((err) => {
          this.logger.warn(`Failed to deduct credit for ${messageId}: ${err.message}`);
        });

        // Update sender metrics
        if (sender) {
          this.senderService.updateSenderMetrics(sender.id, true).catch(() => {});
        }

        return {
          messageId,
          success: true,
          externalId: result.messageId,
          segments: result.segments,
          cost: result.cost,
        };
      } else {
        // Update sender metrics for failure
        if (sender) {
          this.senderService.updateSenderMetrics(sender.id, false).catch(() => {});
        }

        return {
          messageId,
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error: any) {
      this.logger.error(`Failed to send message ${messageId}: ${error.message}`);
      return {
        messageId,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pre-fetch senders for multiple tenants
   */
  private async prefetchSenders(tenantIds: string[], messages: BatchMessage[]): Promise<void> {
    const senderIds = [...new Set(messages.map((m) => m.senderId).filter(Boolean))] as string[];

    for (const tenantId of tenantIds) {
      // Fetch default sender
      const defaultKey = `${tenantId}:default`;
      if (!this.senderCache.has(defaultKey)) {
        try {
          const sender = await this.senderService.getDefaultSender(tenantId);
          this.senderCache.set(defaultKey, { sender, cachedAt: Date.now() });
        } catch {
          this.senderCache.set(defaultKey, { sender: null, cachedAt: Date.now() });
        }
      }
    }

    // Fetch specific senders
    for (const senderId of senderIds) {
      const tenantId = messages.find((m) => m.senderId === senderId)?.tenantId;
      if (!tenantId) continue;

      const cacheKey = `${tenantId}:${senderId}`;
      if (!this.senderCache.has(cacheKey)) {
        try {
          const sender = await this.senderService.getSender(tenantId, senderId);
          this.senderCache.set(cacheKey, { sender, cachedAt: Date.now() });
        } catch {
          // Will fall back to default
        }
      }
    }
  }

  /**
   * Get cached sender
   */
  private async getCachedSender(tenantId: string, senderId?: string): Promise<SmsSender | null> {
    const cacheKey = `${tenantId}:${senderId || 'default'}`;
    const cached = this.senderCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < this.senderCacheTTL) {
      return cached.sender;
    }

    let sender: SmsSender | null = null;

    if (senderId) {
      try {
        sender = await this.senderService.getSender(tenantId, senderId);
      } catch {
        // Fall through to default
      }
    }

    if (!sender) {
      sender = await this.senderService.getDefaultSender(tenantId);
    }

    this.senderCache.set(cacheKey, { sender, cachedAt: Date.now() });
    return sender;
  }

  /**
   * Get from address from sender
   */
  private getFromAddress(sender: SmsSender | null, fallbackSenderId?: string): string | undefined {
    if (sender) {
      if (sender.type === SmsSenderType.SENDER_ID && sender.senderId) {
        return sender.senderId;
      }
      if (sender.phoneNumber) {
        return sender.phoneNumber;
      }
    }
    return fallbackSenderId || undefined;
  }

  /**
   * Personalize message content
   */
  private personalizeContent(content: string, message: BatchMessage): string {
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

  /**
   * Update message statuses in bulk
   */
  async updateMessageStatuses(results: BatchResult[], campaignId: string): Promise<void> {
    const successfulIds = results.filter((r) => r.success).map((r) => r.messageId);
    const failedResults = results.filter((r) => !r.success);

    // Bulk update successful messages
    if (successfulIds.length > 0) {
      await this.messageRepository.update(
        { id: In(successfulIds) },
        {
          status: MessageStatus.SENT,
          sentAt: new Date(),
        }
      );

      // Update external IDs individually (they're different per message)
      for (const result of results.filter((r) => r.success && r.externalId)) {
        await this.messageRepository.update(
          { id: result.messageId },
          { externalId: result.externalId }
        );
      }
    }

    // Update failed messages
    for (const result of failedResults) {
      await this.messageRepository.update(
        { id: result.messageId },
        {
          status: MessageStatus.FAILED,
          failedAt: new Date(),
          errorMessage: result.error,
        }
      );
    }

    // Update campaign counters
    await this.counterService.incrSent(campaignId, successfulIds.length);
    await this.counterService.incrFailed(campaignId, failedResults.length);
  }

  /**
   * Split messages into batches
   */
  splitIntoBatches<T>(items: T[], batchSize?: number): T[][] {
    const size = batchSize || this.batchSize;
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }

    return batches;
  }

  /**
   * Clear sender cache
   */
  clearSenderCache(): void {
    this.senderCache.clear();
    this.logger.log('Sender cache cleared');
  }

  /**
   * Get service stats
   */
  getStats(): { batchSize: number; concurrency: number; senderCacheSize: number } {
    return {
      batchSize: this.batchSize,
      concurrency: this.concurrency,
      senderCacheSize: this.senderCache.size,
    };
  }
}
