import { ContactListMember } from '@/modules/contacts/entities/contact-list-member.entity';
import { ChannelStatus, Contact, ContactStatus } from '@/modules/contacts/entities/contact.entity';
import { ComplianceService } from '@/modules/sms/services/compliance.service';
import { UsageService } from '@/modules/billing/services/usage.service';
import { UsageChannel } from '@/modules/billing/dto/usage.dto';
import { WalletService } from '@/modules/billing/services/wallet.service';
import { PricingService } from '@/modules/billing/services/pricing.service';
import {
  TransactionChannel,
  TransactionReferenceType,
} from '@/modules/billing/entities/wallet-transaction.entity';
import { EmailService, SendEmailOptions } from '@/providers/email/email.service';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { SmsService } from '@/providers/sms/sms.service';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import {
  Campaign,
  CampaignStatus,
  CampaignType,
  EmailContent,
  SmsContent,
} from '../entities/campaign.entity';
import { EmailTrackingService } from './email-tracking.service';

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

// RFC 5322 compliant email regex (simplified but practical)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common disposable/temporary email domains to block
const BLOCKED_EMAIL_DOMAINS = [
  'mailinator.com',
  'tempmail.com',
  'throwaway.email',
  'guerrillamail.com',
  'sharklasers.com',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SendProgress {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  progress: number;
}

@Injectable()
export class CampaignSendService {
  private readonly logger = new Logger(CampaignSendService.name);
  private readonly useQueuedSending: boolean;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(ContactListMember)
    private readonly listMemberRepository: Repository<ContactListMember>,
    private readonly emailService: EmailService,
    private readonly trackingService: EmailTrackingService,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService,
    private readonly cacheService: RedisCacheService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly complianceService: ComplianceService,
    private readonly usageService: UsageService,
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService
  ) {
    // Check if queue-based sending is enabled (handle string 'true')
    const queuedSendingValue = this.configService.get<string>('USE_QUEUED_SENDING', 'false');
    this.useQueuedSending = queuedSendingValue === 'true' || queuedSendingValue === '1';
    this.logger.log(`Queue-based email sending: ${this.useQueuedSending ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Start sending a campaign
   * Supports both queue-based (scalable) and direct (legacy) sending modes
   */
  async sendCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot send campaign in ${campaign.status} status`);
    }

    // Validate SMS compliance before starting campaign
    if (campaign.type === CampaignType.SMS) {
      await this.validateSmsComplianceForCampaign(tenantId, campaign);
    }

    // Validate billing/quota before starting campaign
    await this.validateBillingForCampaign(tenantId, campaign);

    const initiatedAt = new Date();
    this.logger.log(
      `[CAMPAIGN SEND INITIATED] ID: ${campaignId} | Name: ${campaign.name} | ` +
        `Type: ${campaign.type} | Mode: ${this.useQueuedSending && this.queueService.isReady() ? 'QUEUED' : 'DIRECT'} | ` +
        `Timestamp: ${initiatedAt.toISOString()}`
    );

    // Use queue-based sending if enabled and queue is available
    if (this.useQueuedSending && this.queueService.isReady()) {
      return this.sendCampaignQueued(campaign);
    }

    // Fall back to direct sending
    return this.sendCampaignDirect(campaign);
  }

  /**
   * Validate SMS compliance before starting a campaign
   * Checks region-specific requirements (US 10DLC, India DLT, EU GDPR)
   */
  private async validateSmsComplianceForCampaign(
    tenantId: string,
    campaign: Campaign
  ): Promise<void> {
    const content = campaign.content as SmsContent;

    // Get all recipient phone numbers for the campaign
    const phoneNumbers = await this.getRecipientPhoneNumbers(campaign);

    if (phoneNumbers.length === 0) {
      return; // No recipients, nothing to validate
    }

    // Validate campaign compliance (uses tenant's region)
    const complianceResult = await this.complianceService.validateCampaign(tenantId, phoneNumbers);

    // Log compliance validation result
    this.logger.log(
      `[SMS COMPLIANCE CHECK] Campaign: ${campaign.id} | ` +
        `Total: ${complianceResult.totalRecipients} | ` +
        `Compliant: ${complianceResult.compliantRecipients} | ` +
        `Blocked: ${complianceResult.blockedRecipients} | ` +
        `CanSend: ${complianceResult.canSend}`
    );

    // If there are blocking errors in strict mode, throw an exception
    if (!complianceResult.canSend) {
      const errorMessages = complianceResult.errors
        .filter((e) => e.blocking)
        .map((e) => e.message)
        .join('; ');

      throw new ForbiddenException(
        `SMS compliance check failed: ${errorMessages}. ` +
          `${complianceResult.blockedRecipients} of ${complianceResult.totalRecipients} recipients would be blocked.`
      );
    }

    // Log warnings even if we can send
    if (complianceResult.warnings.length > 0) {
      this.logger.warn(
        `[SMS COMPLIANCE WARNINGS] Campaign: ${campaign.id} | ` +
          `Warnings: ${complianceResult.warnings.map((w) => w.message).join('; ')}`
      );
    }

    // Build compliance approval status (simplified - single region per tenant)
    const complianceApproval = {
      approved: complianceResult.canSend,
      checkedAt: new Date().toISOString(),
      errors: complianceResult.errors.map((e) => e.message),
      warnings: complianceResult.warnings.map((w) => w.message),
    };

    // Update campaign with compliance status
    await this.campaignRepository.update(campaign.id, {
      complianceValidated: true,
      complianceApproval,
      metadata: {
        ...((campaign.metadata as Record<string, unknown>) || {}),
        complianceCheck: {
          checkedAt: new Date().toISOString(),
          totalRecipients: complianceResult.totalRecipients,
          compliantRecipients: complianceResult.compliantRecipients,
          blockedRecipients: complianceResult.blockedRecipients,
          regionBreakdown: complianceResult.regionBreakdown,
          warnings: complianceResult.warnings,
        },
      },
    });
  }

  /**
   * Validate billing/quota before starting a campaign
   * Ensures tenant has sufficient quota or wallet balance
   */
  private async validateBillingForCampaign(tenantId: string, campaign: Campaign): Promise<void> {
    try {
      // Get recipient count for the campaign
      const recipients = await this.getRecipients(campaign);
      const recipientCount = recipients.length;

      if (recipientCount === 0) {
        return; // No recipients, nothing to validate
      }

      // Determine channel
      let channel: UsageChannel;
      switch (campaign.type) {
        case CampaignType.SMS:
          channel = UsageChannel.SMS;
          break;
        case CampaignType.EMAIL:
          channel = UsageChannel.EMAIL;
          break;
        case CampaignType.WHATSAPP:
          channel = UsageChannel.WHATSAPP;
          break;
        default:
          return; // Unknown type, skip validation
      }

      // Check if tenant can send the messages
      const canSendResult = await this.usageService.canSendMessages(
        tenantId,
        channel,
        recipientCount
      );

      if (!canSendResult.canSend) {
        throw new ForbiddenException(`Cannot send campaign: ${canSendResult.reason}`);
      }

      // Get cost estimate for logging
      const quotaCheck = await this.usageService.checkQuota(tenantId, channel, recipientCount);
      const unitPrice = this.pricingService.getUnitPrice(channel);
      const estimatedCost = quotaCheck.needsWallet * unitPrice;

      this.logger.log(
        `[BILLING CHECK] Campaign: ${campaign.id} | Recipients: ${recipientCount} | ` +
          `FromQuota: ${quotaCheck.quotaRemaining} | FromWallet: ${quotaCheck.needsWallet} | ` +
          `EstimatedCost: $${estimatedCost.toFixed(4)}`
      );
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Log but don't block on billing validation errors
      this.logger.warn(
        `[BILLING CHECK] Validation error for campaign ${campaign.id}: ${error.message}`
      );
    }
  }

  /**
   * Get recipient phone numbers for SMS campaign
   */
  private async getRecipientPhoneNumbers(campaign: Campaign): Promise<string[]> {
    const { tenantId, audienceType, contactListIds } = campaign;

    let query = this.contactRepository
      .createQueryBuilder('contact')
      .select('contact.phone')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE })
      .andWhere('contact.phone IS NOT NULL')
      .andWhere("contact.phone != ''")
      .andWhere('contact.smsStatus = :smsStatus', { smsStatus: ChannelStatus.ACTIVE });

    if (audienceType === 'list' && contactListIds && contactListIds.length > 0) {
      const listMembers = await this.listMemberRepository.find({
        where: { contactListId: In(contactListIds) },
        select: ['contactId'],
      });
      const contactIds = [...new Set(listMembers.map((m) => m.contactId))];
      if (contactIds.length === 0) return [];
      query = query.andWhere('contact.id IN (:...contactIds)', { contactIds });
    }

    const contacts = await query.getMany();
    return contacts.map((c) => c.phone).filter(Boolean) as string[];
  }

  /**
   * Finalize campaign billing after completion
   * Calculates actual costs and updates usage/wallet
   */
  async finalizeCampaignBilling(campaignId: string): Promise<void> {
    try {
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign) {
        this.logger.warn(`[BILLING] Campaign ${campaignId} not found for billing finalization`);
        return;
      }

      const { tenantId, type, sentCount = 0 } = campaign;

      if (sentCount === 0) {
        this.logger.debug(
          `[BILLING] No messages sent for campaign ${campaignId}, skipping billing`
        );
        return;
      }

      // Determine channel for billing
      let channel: UsageChannel;
      let transactionChannel: TransactionChannel;

      switch (type) {
        case CampaignType.SMS:
          channel = UsageChannel.SMS;
          transactionChannel = TransactionChannel.SMS;
          break;
        case CampaignType.EMAIL:
          channel = UsageChannel.EMAIL;
          transactionChannel = TransactionChannel.EMAIL;
          break;
        case CampaignType.WHATSAPP:
          channel = UsageChannel.WHATSAPP;
          transactionChannel = TransactionChannel.WHATSAPP;
          break;
        default:
          this.logger.warn(`[BILLING] Unknown campaign type ${type}, skipping billing`);
          return;
      }

      // Get unit price for the channel
      const unitPrice = this.pricingService.getUnitPrice(channel);

      // Check quota and calculate overage
      const quotaCheck = await this.usageService.checkQuota(tenantId, channel, sentCount);

      // Messages covered by quota
      const fromQuota = Math.min(sentCount, quotaCheck.quotaRemaining);
      // Messages that need to be paid from wallet
      const fromWallet = sentCount - fromQuota;
      const walletCost = fromWallet * unitPrice;

      this.logger.log(
        `[BILLING] Campaign ${campaignId} | Sent: ${sentCount} | ` +
          `FromQuota: ${fromQuota} | FromWallet: ${fromWallet} | Cost: $${walletCost.toFixed(4)}`
      );

      // Update usage tracking
      await this.usageService.incrementUsage(tenantId, channel, sentCount, walletCost);

      // Deduct from wallet if there's overage
      if (fromWallet > 0 && walletCost > 0) {
        await this.walletService.debit({
          tenantId,
          amount: walletCost,
          channel: transactionChannel,
          description: `Campaign ${campaign.name} - ${fromWallet} ${type.toLowerCase()} messages`,
          referenceType: TransactionReferenceType.CAMPAIGN,
          referenceId: campaignId,
          messageCount: fromWallet,
          unitPrice,
        });

        this.logger.log(
          `[BILLING] Deducted $${walletCost.toFixed(4)} from tenant ${tenantId} wallet for campaign ${campaignId}`
        );
      }

      // Update campaign with billing info
      await this.campaignRepository.update(campaignId, {
        metadata: {
          ...((campaign.metadata as Record<string, unknown>) || {}),
          billing: {
            finalizedAt: new Date().toISOString(),
            totalSent: sentCount,
            fromQuota,
            fromWallet,
            unitPrice,
            totalCost: walletCost,
          },
        },
      });

      this.logger.log(`[BILLING] Finalized billing for campaign ${campaignId}`);
    } catch (error: any) {
      this.logger.error(
        `[BILLING] Failed to finalize billing for campaign ${campaignId}: ${error.message}`
      );
      // Don't throw - billing errors shouldn't fail campaign completion
    }
  }

  /**
   * Send campaign using queue-based approach (scalable)
   */
  private async sendCampaignQueued(campaign: Campaign): Promise<Campaign> {
    if (campaign.type === CampaignType.EMAIL) {
      this.logger.log(
        `[CAMPAIGN QUEUED] ID: ${campaign.id} | Publishing to email.prepare.queue | Timestamp: ${new Date().toISOString()}`
      );

      // Publish to prepare queue - workers will handle the rest
      await this.queueService.publishEmailPrepare({
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        batchSize: 100,
      });
    } else if (campaign.type === CampaignType.SMS) {
      this.logger.log(
        `[CAMPAIGN QUEUED] ID: ${campaign.id} | Publishing to sms.prepare.queue | Timestamp: ${new Date().toISOString()}`
      );

      // Publish to SMS prepare queue
      await this.queueService.publishSmsPrepare({
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        batchSize: 100,
      });
    }

    // Return campaign - status will be updated by workers
    return campaign;
  }

  /**
   * Send campaign using direct approach (legacy, single process)
   */
  private async sendCampaignDirect(campaign: Campaign): Promise<Campaign> {
    // Get recipients
    const contacts = await this.getRecipients(campaign);

    if (contacts.length === 0) {
      throw new BadRequestException('No valid recipients found for this campaign');
    }

    this.logger.log(
      `Starting campaign ${campaign.id} with ${contacts.length} recipients (direct mode)`
    );

    // Update campaign status
    campaign.status = CampaignStatus.SENDING;
    campaign.startedAt = new Date();
    campaign.totalRecipients = contacts.length;
    await this.campaignRepository.save(campaign);

    // Create campaign messages for each recipient
    await this.createCampaignMessages(campaign, contacts);

    // Initialize Redis counters if available
    if (this.counterService) {
      await this.counterService.initCampaignStats(campaign.id);
    }

    // Start sending (async - don't await)
    this.processCampaignSending(campaign).catch((error) => {
      this.logger.error(`Campaign ${campaign.id} failed: ${error.message}`, error.stack);
    });

    return campaign;
  }

  /**
   * Get recipients for a campaign
   */
  private async getRecipients(campaign: Campaign): Promise<Contact[]> {
    const { tenantId, type, audienceType, contactListIds } = campaign;

    let query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.deletedAt IS NULL')
      // Only include contacts with active status (excludes unsubscribed, bounced, complained)
      .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE });

    // Filter by channel availability
    if (type === CampaignType.EMAIL) {
      query = query
        .andWhere('contact.email IS NOT NULL')
        .andWhere("contact.email != ''")
        // Only active email status (excludes unsubscribed, bounced)
        .andWhere('contact.emailStatus = :emailStatus', { emailStatus: ChannelStatus.ACTIVE });
    } else if (type === CampaignType.SMS) {
      query = query
        .andWhere('contact.phone IS NOT NULL')
        .andWhere("contact.phone != ''")
        .andWhere('contact.smsStatus = :smsStatus', { smsStatus: ChannelStatus.ACTIVE });
    } else if (type === CampaignType.WHATSAPP) {
      query = query
        .andWhere('contact.whatsappNumber IS NOT NULL')
        .andWhere("contact.whatsappNumber != ''")
        .andWhere('contact.whatsappStatus = :whatsappStatus', {
          whatsappStatus: ChannelStatus.ACTIVE,
        });
    }

    // Filter by list if specific lists selected
    if (audienceType === 'list' && contactListIds && contactListIds.length > 0) {
      const listMembers = await this.listMemberRepository.find({
        where: { contactListId: In(contactListIds) },
        select: ['contactId'],
      });

      const contactIds = [...new Set(listMembers.map((m) => m.contactId))];

      if (contactIds.length === 0) {
        return [];
      }

      query = query.andWhere('contact.id IN (:...contactIds)', { contactIds });
    }

    const contacts = await query.getMany();

    // Additional email validation for email campaigns
    if (type === CampaignType.EMAIL) {
      return contacts.filter((contact) => {
        const validation = this.validateEmail(contact.email);
        if (!validation.valid) {
          this.logger.debug(`Skipping contact ${contact.id}: ${validation.reason}`);
        }
        return validation.valid;
      });
    }

    return contacts;
  }

  /**
   * Validate email address format and domain
   */
  private validateEmail(email: string | null): { valid: boolean; reason?: string } {
    if (!email) {
      return { valid: false, reason: 'Email is null or empty' };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check basic format
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return { valid: false, reason: 'Invalid email format' };
    }

    // Check for blocked disposable domains
    const domain = trimmedEmail.split('@')[1];
    if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
      return { valid: false, reason: `Blocked domain: ${domain}` };
    }

    // Check for obviously invalid patterns
    if (trimmedEmail.includes('..') || trimmedEmail.startsWith('.') || trimmedEmail.endsWith('.')) {
      return { valid: false, reason: 'Invalid email pattern' };
    }

    return { valid: true };
  }

  /**
   * Create campaign message records for all recipients
   */
  private async createCampaignMessages(campaign: Campaign, contacts: Contact[]): Promise<void> {
    const messages: Partial<CampaignMessage>[] = contacts.map((contact) => ({
      campaignId: campaign.id,
      contactId: contact.id,
      tenantId: campaign.tenantId,
      recipientEmail: contact.email,
      recipientPhone: contact.phone,
      recipientName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
      status: MessageStatus.QUEUED,
      queuedAt: new Date(),
    }));

    // Insert in batches
    const batchSize = 500;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const entities = this.messageRepository.create(batch);
      await this.messageRepository.save(entities);
    }

    this.logger.log(`Created ${messages.length} campaign messages for campaign ${campaign.id}`);
  }

  /**
   * Process campaign sending
   */
  private async processCampaignSending(campaign: Campaign): Promise<void> {
    const batchSize = 50;
    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
      // Get all queued messages
      const totalMessages = await this.messageRepository.count({
        where: { campaignId: campaign.id, status: MessageStatus.QUEUED },
      });

      this.logger.log(`Processing ${totalMessages} messages for campaign ${campaign.id}`);

      let hasMoreMessages = true;
      while (hasMoreMessages) {
        // Check if campaign was paused or cancelled
        const currentCampaign = await this.campaignRepository.findOne({
          where: { id: campaign.id },
        });

        if (!currentCampaign || currentCampaign.status === CampaignStatus.PAUSED) {
          this.logger.log(`Campaign ${campaign.id} paused`);
          hasMoreMessages = false;
          break;
        }

        if (currentCampaign.status === CampaignStatus.CANCELLED) {
          this.logger.log(`Campaign ${campaign.id} cancelled`);
          hasMoreMessages = false;
          break;
        }

        // Get next batch of messages
        const messages = await this.messageRepository.find({
          where: { campaignId: campaign.id, status: MessageStatus.QUEUED },
          relations: ['contact'],
          take: batchSize,
        });

        if (messages.length === 0) {
          hasMoreMessages = false;
          break;
        }

        // Process batch
        for (const message of messages) {
          const result = await this.sendSingleMessage(campaign, message);
          processedCount++;

          if (result.success) {
            sentCount++;
          } else {
            failedCount++;
          }

          // Update campaign stats every 10 messages
          if (processedCount % 10 === 0) {
            await this.updateCampaignStats(campaign.id, sentCount, failedCount);
          }
        }

        // Small delay between batches
        await this.delay(100);
      }

      // Final stats update
      await this.updateCampaignStats(campaign.id, sentCount, failedCount);

      // Mark campaign as sent
      await this.campaignRepository.update(campaign.id, {
        status: CampaignStatus.SENT,
        completedAt: new Date(),
        sentCount,
        failedCount,
      });

      this.logger.log(
        `Campaign ${campaign.id} completed: ${sentCount} sent, ${failedCount} failed`
      );
    } catch (error: any) {
      this.logger.error(`Campaign ${campaign.id} error: ${error.message}`, error.stack);

      await this.campaignRepository.update(campaign.id, {
        status: CampaignStatus.FAILED,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Send a single message
   */
  private async sendSingleMessage(
    campaign: Campaign,
    message: CampaignMessage
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Mark as sending
      await this.messageRepository.update(message.id, {
        status: MessageStatus.SENDING,
      });

      if (campaign.type === CampaignType.EMAIL) {
        return await this.sendEmailMessage(campaign, message);
      } else if (campaign.type === CampaignType.SMS) {
        return await this.sendSmsMessage(campaign, message);
      }

      // WhatsApp will be implemented in Phase 6
      return { success: false, error: 'Channel not implemented' };
    } catch (error: any) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send an SMS message
   */
  private async sendSmsMessage(
    campaign: Campaign,
    message: CampaignMessage
  ): Promise<{ success: boolean; error?: string }> {
    const content = campaign.content as SmsContent;
    const contact = message.contact;

    if (!message.recipientPhone) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: 'No phone number',
      });
      return { success: false, error: 'No phone number' };
    }

    // Personalize content
    // Note: We don't HTML escape SMS content as it's plain text
    const personalizedBody = this.personalizeSmsContent(content.message, contact);

    const result = await this.smsService.sendSms({
      to: message.recipientPhone,
      from: content.senderId || undefined,
      message: personalizedBody,
    });

    if (result.success) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.SENT,
        sentAt: new Date(),
        externalId: result.messageId,
        cost: result.cost,
        segments: result.segments, // Assuming segments field exists in entity, otherwise it will be ignored
        renderedContent: {
          body: personalizedBody,
        },
      });

      // Create sent event
      await this.createEvent(message, EventType.SENT);

      return { success: true };
    } else {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: result.error,
      });

      // Create failed event
      await this.createEvent(message, EventType.FAILED);

      return { success: false, error: result.error };
    }
  }

  /**
   * Personalize SMS content (no HTML escaping)
   */
  private personalizeSmsContent(content: string, contact: Contact): string {
    if (!content) return content;

    const replacements: Record<string, string> = {
      first_name: contact.firstName || '',
      last_name: contact.lastName || '',
      full_name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      job_title: contact.jobTitle || '',
      city: contact.city || '',
      state: contact.state || '',
      country: contact.country || '',
    };

    if (contact.customFields) {
      Object.entries(contact.customFields).forEach(([key, value]) => {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          replacements[key.toLowerCase()] = String(value || '');
        }
      });
    }

    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return replacements[variable.toLowerCase()] ?? match;
    });
  }

  /**
   * Send an email message
   */
  private async sendEmailMessage(
    campaign: Campaign,
    message: CampaignMessage
  ): Promise<{ success: boolean; error?: string }> {
    const content = campaign.content as EmailContent;
    const contact = message.contact;

    if (!contact?.email) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: 'No email address',
      });
      return { success: false, error: 'No email address' };
    }

    // Personalize content
    const personalizedSubject = this.personalizeContent(content.subject, contact);
    let personalizedHtml = this.personalizeContent(content.htmlContent, contact);

    // Add tracking (open pixel, click tracking, unsubscribe link)
    personalizedHtml = this.trackingService.processEmailForTracking(
      personalizedHtml,
      message.id,
      campaign.id,
      contact.id,
      campaign.tenantId,
      {
        trackOpens: true,
        trackClicks: true,
        addUnsubscribe: true,
      }
    );

    const emailOptions: SendEmailOptions = {
      to: contact.email,
      from: content.fromEmail,
      fromName: content.fromName,
      replyTo: content.replyTo,
      subject: personalizedSubject,
      html: personalizedHtml,
    };

    const result = await this.emailService.sendEmail(emailOptions);

    if (result.success) {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.SENT,
        sentAt: new Date(),
        externalId: result.messageId,
        renderedContent: {
          subject: personalizedSubject,
          fromName: content.fromName,
          fromEmail: content.fromEmail,
        },
      });

      // Create sent event
      await this.createEvent(message, EventType.SENT);

      return { success: true };
    } else {
      await this.messageRepository.update(message.id, {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: result.error,
      });

      // Create failed event
      await this.createEvent(message, EventType.FAILED);

      return { success: false, error: result.error };
    }
  }

  /**
   * Personalize content by replacing variables
   * All values are HTML-escaped to prevent XSS attacks
   */
  private personalizeContent(content: string, contact: Contact): string {
    if (!content) return content;

    // Build replacements with HTML-escaped values to prevent XSS
    const replacements: Record<string, string> = {
      first_name: escapeHtml(contact.firstName || ''),
      last_name: escapeHtml(contact.lastName || ''),
      full_name: escapeHtml([contact.firstName, contact.lastName].filter(Boolean).join(' ') || ''),
      email: escapeHtml(contact.email || ''),
      phone: escapeHtml(contact.phone || ''),
      company: escapeHtml(contact.company || ''),
      job_title: escapeHtml(contact.jobTitle || ''),
      city: escapeHtml(contact.city || ''),
      state: escapeHtml(contact.state || ''),
      country: escapeHtml(contact.country || ''),
    };

    // Add custom fields with HTML escaping to prevent XSS
    if (contact.customFields) {
      Object.entries(contact.customFields).forEach(([key, value]) => {
        // Only allow alphanumeric keys to prevent injection
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          replacements[key.toLowerCase()] = escapeHtml(String(value || ''));
        }
      });
    }

    // Replace {{variable}} patterns
    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return replacements[variable.toLowerCase()] || match;
    });
  }

  /**
   * Create a campaign event
   */
  private async createEvent(message: CampaignMessage, eventType: EventType): Promise<void> {
    const event = this.eventRepository.create({
      campaignMessageId: message.id,
      campaignId: message.campaignId,
      contactId: message.contactId,
      tenantId: message.tenantId,
      eventType,
    });

    await this.eventRepository.save(event);
  }

  /**
   * Update campaign statistics
   */
  private async updateCampaignStats(
    campaignId: string,
    sentCount: number,
    failedCount: number
  ): Promise<void> {
    await this.campaignRepository.update(campaignId, {
      sentCount,
      failedCount,
    });
  }

  /**
   * Send a test email
   */
  async sendTestEmail(
    tenantId: string,
    campaignId: string,
    testEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (campaign.type !== CampaignType.EMAIL) {
      throw new BadRequestException('Test send only available for email campaigns');
    }

    const content = campaign.content as EmailContent;

    // Create a mock contact for personalization
    const mockContact = {
      firstName: 'Test',
      lastName: 'User',
      email: testEmail,
      phone: '+1234567890',
      company: 'Test Company',
      jobTitle: 'Tester',
      city: 'Test City',
      state: 'TS',
      country: 'Test Country',
      customFields: {},
    } as Contact;

    const personalizedSubject = this.personalizeContent(`[TEST] ${content.subject}`, mockContact);
    const personalizedHtml = this.personalizeContent(content.htmlContent, mockContact);

    const result = await this.emailService.sendEmail({
      to: testEmail,
      from: content.fromEmail,
      fromName: content.fromName,
      replyTo: content.replyTo,
      subject: personalizedSubject,
      html: personalizedHtml,
    });

    return result;
  }

  /**
   * Send a test SMS
   */
  async sendTestSms(
    tenantId: string,
    campaignId: string,
    testPhone: string
  ): Promise<{ success: boolean; error?: string }> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (campaign.type !== CampaignType.SMS) {
      throw new BadRequestException('Test send only available for SMS campaigns');
    }

    // Need to import SmsService and inject it
    const content = campaign.content as SmsContent;

    // Create a mock contact for personalization
    const mockContact = {
      firstName: 'Test',
      lastName: 'User',
      phone: testPhone,
      email: 'test@example.com',
      customFields: {},
    } as Contact;

    const personalizedBody = this.personalizeContent(content.message, mockContact);

    const result = await this.smsService.sendSms({
      to: testPhone,
      from: content.senderId || undefined,
      message: personalizedBody,
    });

    return result;
  }

  /**
   * Release a prepared campaign (Exact Time Delivery)
   * Flushes prepared messages to queue immediately
   */
  async releaseCampaign(tenantId: string, campaignId: string): Promise<void> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (campaign.status !== CampaignStatus.READY) {
      throw new BadRequestException(`Cannot release campaign in ${campaign.status} status`);
    }

    this.logger.log(
      `[CAMPAIGN RELEASE] Releasing campaign ${campaignId} at ${new Date().toISOString()}`
    );

    // Update campaign status to SENDING
    await this.campaignRepository.update(campaignId, {
      status: CampaignStatus.SENDING,
      startedAt: new Date(),
    });

    await this.cacheService.setCampaignProgress(campaignId, {
      status: 'sending',
    });

    // We need to move messages from PREPARED to QUEUED and push to RabbitMQ
    // For performance, we'll stream them in batches

    // 1. Get total count
    const totalPrepared = await this.messageRepository.count({
      where: { campaignId, status: MessageStatus.PREPARED },
    });

    this.logger.log(`Found ${totalPrepared} prepared messages to release`);

    // 2. Process in chunks
    const batchSize = 1000;
    let processed = 0;

    while (processed < totalPrepared) {
      // Update a batch and return their IDs/details
      // Using raw query for maximum performance with RETURNING
      // Note: We need contact details for the queue message

      // Alternative approach for TypeORM safely:
      // 1. Find batch of PREPARED messages with relations
      const messages = await this.messageRepository.find({
        where: { campaignId, status: MessageStatus.PREPARED },
        take: batchSize,
        relations: ['contact'],
        order: { id: 'ASC' },
      });

      if (messages.length === 0) break;

      const messageIds = messages.map((m) => m.id);

      // 2. Update status in DB
      await this.messageRepository.update(
        { id: In(messageIds) },
        { status: MessageStatus.QUEUED, queuedAt: new Date() }
      );

      // 3. Push to RabbitMQ
      if (campaign.type === CampaignType.EMAIL) {
        const sendMessages: any[] = [];
        for (const message of messages) {
          if (!message.contact?.email) continue;
          sendMessages.push({
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            messageId: message.id,
            contactId: message.contactId,
            email: message.contact.email,
            firstName: message.contact.firstName || undefined,
            lastName: message.contact.lastName || undefined,
            customFields: message.contact.customFields || undefined,
            attempt: 1,
          });
        }
        if (sendMessages.length > 0) {
          await this.queueService.publishEmailSendBatch(sendMessages);
        }
      } else if (campaign.type === CampaignType.SMS) {
        const sendMessages: any[] = [];
        for (const message of messages) {
          if (!message.recipientPhone) continue;
          sendMessages.push({
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            messageId: message.id,
            contactId: message.contactId,
            phoneNumber: message.recipientPhone,
            firstName: message.contact?.firstName || undefined,
            lastName: message.contact?.lastName || undefined,
            customFields: message.contact?.customFields || undefined,
            attempt: 1,
          });
        }
        if (sendMessages.length > 0) {
          await this.queueService.publishSmsSendBatch(sendMessages);
        }
      }

      processed += messages.length;
      this.logger.log(`Released ${processed}/${totalPrepared} messages`);
    }

    this.logger.log(
      `[CAMPAIGN RELEASE COMPLETE] Released ${processed} messages for campaign ${campaignId}`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
