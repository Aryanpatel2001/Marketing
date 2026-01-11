import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as https from 'https';
import { Public } from '@/common/decorators';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';
import { Contact, ChannelStatus, ContactStatus } from '@/modules/contacts/entities/contact.entity';

// AWS SNS Message Types
interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

// SES Notification Types
interface SESBounce {
  bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  bounceSubType: string;
  bouncedRecipients: Array<{
    emailAddress: string;
    action?: string;
    status?: string;
    diagnosticCode?: string;
  }>;
  timestamp: string;
  feedbackId: string;
}

interface SESComplaint {
  complainedRecipients: Array<{
    emailAddress: string;
  }>;
  timestamp: string;
  feedbackId: string;
  complaintFeedbackType?: string;
}

interface SESDelivery {
  timestamp: string;
  processingTimeMillis: number;
  recipients: string[];
  smtpResponse: string;
}

interface SESNotification {
  notificationType: 'Bounce' | 'Complaint' | 'Delivery';
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    sourceArn?: string;
    destination: string[];
    headers?: Array<{ name: string; value: string }>;
  };
  bounce?: SESBounce;
  complaint?: SESComplaint;
  delivery?: SESDelivery;
}

// Certificate cache with max size limit to prevent memory leaks
const CERT_CACHE_MAX_SIZE = 100;
const CERT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

class CertificateCache {
  private cache = new Map<string, { cert: string; expiresAt: number; lastAccess: number }>();

  get(url: string): string | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(url);
      return null;
    }

    // Update last access time
    entry.lastAccess = Date.now();
    return entry.cert;
  }

  set(url: string, cert: string): void {
    // Evict oldest entries if at max size
    if (this.cache.size >= CERT_CACHE_MAX_SIZE) {
      this.evictOldest();
    }

    this.cache.set(url, {
      cert,
      expiresAt: Date.now() + CERT_CACHE_TTL_MS,
      lastAccess: Date.now(),
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, value] of this.cache.entries()) {
      // Also clean up expired entries
      if (value.expiresAt < Date.now()) {
        this.cache.delete(key);
        continue;
      }

      if (value.lastAccess < oldestAccess) {
        oldestAccess = value.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

const certCache = new CertificateCache();

// Idempotency cache to prevent processing duplicate webhooks
// SNS can deliver the same message multiple times
const IDEMPOTENCY_CACHE_MAX_SIZE = 10000;
const IDEMPOTENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class IdempotencyCache {
  private cache = new Map<string, number>(); // messageId -> timestamp

  has(messageId: string): boolean {
    const timestamp = this.cache.get(messageId);
    if (!timestamp) return false;

    // Check if expired
    if (Date.now() - timestamp > IDEMPOTENCY_CACHE_TTL_MS) {
      this.cache.delete(messageId);
      return false;
    }

    return true;
  }

  add(messageId: string): void {
    // Clean up if at max size
    if (this.cache.size >= IDEMPOTENCY_CACHE_MAX_SIZE) {
      this.cleanup();
    }
    this.cache.set(messageId, Date.now());
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > IDEMPOTENCY_CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
    // If still too large, delete oldest entries
    if (this.cache.size >= IDEMPOTENCY_CACHE_MAX_SIZE) {
      const entries = [...this.cache.entries()].sort((a, b) => a[1] - b[1]);
      const toDelete = entries.slice(0, Math.floor(entries.length / 2));
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }
}

const idempotencyCache = new IdempotencyCache();

@ApiTags('Webhooks')
@Controller('webhooks/ses')
export class SESWebhookController {
  private readonly logger = new Logger(SESWebhookController.name);
  private readonly verifySignatures: boolean;
  private readonly bounceThreshold: number;
  private readonly complaintThreshold: number;

  constructor(
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly configService: ConfigService
  ) {
    // Enable signature verification in production
    this.verifySignatures = this.configService.get<string>('NODE_ENV') === 'production';

    // Configurable thresholds (with sensible defaults)
    this.bounceThreshold = this.configService.get<number>('EMAIL_BOUNCE_THRESHOLD', 0.05); // 5%
    this.complaintThreshold = this.configService.get<number>('EMAIL_COMPLAINT_THRESHOLD', 0.001); // 0.1%
  }

  /**
   * Handle SNS notifications from AWS SES
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle AWS SES notifications via SNS' })
  async handleSESNotification(
    @Body() body: SNSMessage | SESNotification,
    @Headers('x-amz-sns-message-type') messageType?: string
  ): Promise<{ success: boolean }> {
    this.logger.debug(`Received SNS message type: ${messageType || 'direct'}`);

    try {
      // Handle SNS subscription confirmation
      if (messageType === 'SubscriptionConfirmation') {
        const snsMessage = body as SNSMessage;

        // Verify the message signature before confirming
        if (this.verifySignatures) {
          const isValid = await this.verifySNSSignature(snsMessage);
          if (!isValid) {
            this.logger.warn('Invalid SNS subscription confirmation signature');
            throw new BadRequestException('Invalid signature');
          }
        }

        // Auto-confirm subscription by visiting the SubscribeURL
        if (snsMessage.SubscribeURL) {
          await this.confirmSubscription(snsMessage.SubscribeURL);
          this.logger.log('SNS subscription confirmed successfully');
        }
        return { success: true };
      }

      // Handle SNS notification wrapper
      if (messageType === 'Notification') {
        const snsMessage = body as SNSMessage;

        // Idempotency check - skip if already processed
        if (idempotencyCache.has(snsMessage.MessageId)) {
          this.logger.debug(`Skipping duplicate SNS message: ${snsMessage.MessageId}`);
          return { success: true };
        }

        // Verify the message signature
        if (this.verifySignatures) {
          const isValid = await this.verifySNSSignature(snsMessage);
          if (!isValid) {
            this.logger.warn('Invalid SNS notification signature - possible spoofing attempt');
            throw new BadRequestException('Invalid signature');
          }
        }

        // Mark as processed before actual processing to prevent race conditions
        idempotencyCache.add(snsMessage.MessageId);

        const notification: SESNotification = JSON.parse(snsMessage.Message);
        await this.processNotification(notification);
        return { success: true };
      }

      // Handle direct SES notification (for testing or direct integration)
      if ('notificationType' in body) {
        // In production, direct notifications without SNS wrapper should be rejected
        if (this.verifySignatures) {
          this.logger.warn('Direct SES notification rejected in production mode');
          throw new BadRequestException('Direct notifications not allowed');
        }
        await this.processNotification(body as SESNotification);
        return { success: true };
      }

      this.logger.warn('Unknown notification format received');
      return { success: false };
    } catch (error: any) {
      this.logger.error(`Failed to process SES notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify SNS message signature
   * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
   */
  private async verifySNSSignature(message: SNSMessage): Promise<boolean> {
    try {
      // Validate certificate URL is from AWS SNS
      const certUrl = new URL(message.SigningCertURL);

      // Strict validation of certificate URL:
      // 1. Must be HTTPS
      // 2. Must be from sns.<region>.amazonaws.com (exact pattern match)
      // 3. Must be a .pem file
      const validHostnamePattern = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

      if (certUrl.protocol !== 'https:') {
        this.logger.warn(`Certificate URL must be HTTPS: ${message.SigningCertURL}`);
        return false;
      }

      if (!validHostnamePattern.test(certUrl.hostname)) {
        this.logger.warn(`Invalid certificate hostname: ${certUrl.hostname}`);
        return false;
      }

      if (!certUrl.pathname.endsWith('.pem')) {
        this.logger.warn(`Certificate URL must end with .pem: ${message.SigningCertURL}`);
        return false;
      }

      // Get certificate (with caching)
      const cert = await this.getCertificate(message.SigningCertURL);

      // Build the string to sign based on message type
      let stringToSign: string;
      if (message.Type === 'Notification') {
        stringToSign = this.buildNotificationStringToSign(message);
      } else if (
        message.Type === 'SubscriptionConfirmation' ||
        message.Type === 'UnsubscribeConfirmation'
      ) {
        stringToSign = this.buildSubscriptionStringToSign(message);
      } else {
        this.logger.warn(`Unknown message type: ${message.Type}`);
        return false;
      }

      // Verify signature
      const verifier = crypto.createVerify('SHA1');
      verifier.update(stringToSign, 'utf8');

      const signatureBuffer = Buffer.from(message.Signature, 'base64');
      return verifier.verify(cert, signatureBuffer);
    } catch (error: any) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Build string to sign for Notification messages
   */
  private buildNotificationStringToSign(message: SNSMessage): string {
    const parts: string[] = ['Message', message.Message, 'MessageId', message.MessageId];

    // Subject is optional
    if ('Subject' in message) {
      parts.push('Subject', (message as any).Subject);
    }

    parts.push('Timestamp', message.Timestamp, 'TopicArn', message.TopicArn, 'Type', message.Type);

    return parts.join('\n') + '\n';
  }

  /**
   * Build string to sign for Subscription messages
   */
  private buildSubscriptionStringToSign(message: SNSMessage): string {
    const parts: string[] = [
      'Message',
      message.Message,
      'MessageId',
      message.MessageId,
      'SubscribeURL',
      message.SubscribeURL || '',
      'Timestamp',
      message.Timestamp,
      'Token',
      (message as any).Token || '',
      'TopicArn',
      message.TopicArn,
      'Type',
      message.Type,
    ];

    return parts.join('\n') + '\n';
  }

  /**
   * Get certificate from URL with caching
   */
  private async getCertificate(url: string): Promise<string> {
    // Check cache
    const cached = certCache.get(url);
    if (cached) {
      return cached;
    }

    // Fetch certificate
    const cert = await this.fetchCertificate(url);

    // Add to cache (TTL managed by cache class)
    certCache.set(url, cert);

    return cert;
  }

  /**
   * Fetch certificate from URL
   */
  private fetchCertificate(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch certificate: ${res.statusCode}`));
            return;
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Confirm SNS subscription
   */
  private confirmSubscription(subscribeUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https
        .get(subscribeUrl, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Failed to confirm subscription: ${res.statusCode}`));
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Process SES notification
   */
  private async processNotification(notification: SESNotification): Promise<void> {
    const { notificationType, mail } = notification;
    const messageId = mail.messageId;

    this.logger.log(`Processing ${notificationType} notification for message: ${messageId}`);

    // Find the campaign message by external ID (SES message ID)
    const message = await this.messageRepository.findOne({
      where: { externalId: messageId },
      relations: ['campaign'],
    });

    if (!message) {
      this.logger.warn(`No campaign message found for SES message ID: ${messageId}`);
      return;
    }

    switch (notificationType) {
      case 'Bounce':
        await this.handleBounce(message, notification.bounce!);
        break;
      case 'Complaint':
        await this.handleComplaint(message, notification.complaint!);
        break;
      case 'Delivery':
        await this.handleDelivery(message, notification.delivery!);
        break;
      default:
        this.logger.warn(`Unknown notification type: ${notificationType}`);
    }
  }

  /**
   * Handle bounce notification
   */
  private async handleBounce(message: CampaignMessage, bounce: SESBounce): Promise<void> {
    const isPermanent = bounce.bounceType === 'Permanent';
    const isTransient = bounce.bounceType === 'Transient';

    this.logger.log(
      `Bounce (${bounce.bounceType}/${bounce.bounceSubType}) for message ${message.id}`
    );

    if (isTransient) {
      // Soft bounce - increment retry count, don't mark as failed yet
      const newRetryCount = (message.retryCount || 0) + 1;

      if (newRetryCount < 3) {
        // Allow retry
        await this.messageRepository.update(message.id, {
          status: MessageStatus.QUEUED,
          retryCount: newRetryCount,
          errorCode: bounce.bounceSubType,
          errorMessage: `Transient bounce (attempt ${newRetryCount}): ${bounce.bouncedRecipients[0]?.diagnosticCode || bounce.bounceSubType}`,
        });
        this.logger.log(
          `Soft bounce for message ${message.id}, will retry (attempt ${newRetryCount})`
        );
        return;
      }
    }

    // Permanent bounce or exceeded retry limit
    await this.messageRepository.update(message.id, {
      status: MessageStatus.BOUNCED,
      failedAt: new Date(bounce.timestamp),
      errorCode: bounce.bounceSubType,
      errorMessage: bounce.bouncedRecipients[0]?.diagnosticCode || bounce.bounceType,
    });

    // Create bounce event
    await this.createEvent(message, EventType.BOUNCED, {
      bounceType: bounce.bounceType,
      bounceSubType: bounce.bounceSubType,
    });

    // Update campaign bounce count
    await this.campaignRepository.increment({ id: message.campaignId }, 'bouncedCount', 1);

    // For permanent bounces, mark contact email as bounced
    if (isPermanent && message.contactId) {
      await this.contactRepository.update(
        { id: message.contactId },
        { emailStatus: ChannelStatus.BOUNCED }
      );
      this.logger.log(`Marked contact ${message.contactId} email as bounced`);
    }

    // Check bounce rate and pause campaign if too high
    await this.checkBounceRateAndPause(message.campaignId);
  }

  /**
   * Handle complaint notification
   */
  private async handleComplaint(message: CampaignMessage, complaint: SESComplaint): Promise<void> {
    this.logger.log(
      `Complaint (${complaint.complaintFeedbackType || 'unknown'}) for message ${message.id}`
    );

    // Update message status
    await this.messageRepository.update(message.id, {
      status: MessageStatus.COMPLAINED,
    });

    // Create complaint event
    await this.createEvent(message, EventType.COMPLAINED, {
      complaintType: complaint.complaintFeedbackType,
    });

    // Update campaign complaint count
    await this.campaignRepository.increment({ id: message.campaignId }, 'complainedCount', 1);

    // Mark contact email as unsubscribed and status as complained
    if (message.contactId) {
      await this.contactRepository.update(
        { id: message.contactId },
        {
          emailStatus: ChannelStatus.UNSUBSCRIBED,
          status: ContactStatus.COMPLAINED,
        }
      );
      this.logger.log(`Marked contact ${message.contactId} as complained`);
    }

    // Check complaint rate and pause campaign if too high
    await this.checkComplaintRateAndPause(message.campaignId);
  }

  /**
   * Handle delivery notification
   */
  private async handleDelivery(message: CampaignMessage, delivery: SESDelivery): Promise<void> {
    this.logger.debug(`Delivery confirmed for message ${message.id}`);

    // Only update if in appropriate state
    const updatableStatuses = [MessageStatus.SENT, MessageStatus.SENDING, MessageStatus.QUEUED];
    if (updatableStatuses.includes(message.status)) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.DELIVERED,
        deliveredAt: new Date(delivery.timestamp),
      });

      // Create delivery event
      await this.createEvent(message, EventType.DELIVERED);

      // Update campaign delivered count
      await this.campaignRepository.increment({ id: message.campaignId }, 'deliveredCount', 1);
    }
  }

  /**
   * Check bounce rate and pause campaign if too high
   */
  private async checkBounceRateAndPause(campaignId: string): Promise<void> {
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });
    if (!campaign || campaign.status !== CampaignStatus.SENDING) return;

    const totalSent = campaign.sentCount || 0;
    const bounced = campaign.bouncedCount || 0;

    if (totalSent >= 100) {
      // Only check after 100 emails to avoid false positives
      const bounceRate = bounced / totalSent;

      if (bounceRate > this.bounceThreshold) {
        this.logger.warn(
          `Campaign ${campaignId} paused due to high bounce rate: ${(bounceRate * 100).toFixed(2)}% (threshold: ${(this.bounceThreshold * 100).toFixed(2)}%)`
        );
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.PAUSED,
        });
      }
    }
  }

  /**
   * Check complaint rate and pause campaign if too high
   */
  private async checkComplaintRateAndPause(campaignId: string): Promise<void> {
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });
    if (!campaign || campaign.status !== CampaignStatus.SENDING) return;

    const totalSent = campaign.sentCount || 0;
    const complaints = campaign.complainedCount || 0;

    if (totalSent >= 100) {
      const complaintRate = complaints / totalSent;

      if (complaintRate > this.complaintThreshold) {
        this.logger.warn(
          `Campaign ${campaignId} paused due to high complaint rate: ${(complaintRate * 100).toFixed(4)}% (threshold: ${(this.complaintThreshold * 100).toFixed(4)}%)`
        );
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.PAUSED,
        });
      }
    }
  }

  /**
   * Create a campaign event
   */
  private async createEvent(
    message: CampaignMessage,
    eventType: EventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event = this.eventRepository.create({
      campaignMessageId: message.id,
      campaignId: message.campaignId,
      contactId: message.contactId,
      tenantId: message.tenantId,
      eventType,
      metadata,
    });

    await this.eventRepository.save(event);
  }
}
