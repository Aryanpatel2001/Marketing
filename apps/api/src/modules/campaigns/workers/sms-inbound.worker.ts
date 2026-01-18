import { Contact, ChannelStatus } from '@/modules/contacts/entities/contact.entity';
import { InboundSmsMessage, QUEUES, WORKER_CONFIG } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConsumeMessage } from 'amqplib';
import { Repository, In } from 'typeorm';
import { InboundSms } from '../entities/inbound-sms.entity';
import { CampaignMessage } from '../entities/campaign-message.entity';
import { SmsSender } from '@/modules/sms/entities/sms-sender.entity';

// Opt-out keywords (case insensitive)
const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT'];

// Opt-in keywords for re-subscription
const OPT_IN_KEYWORDS = ['START', 'SUBSCRIBE', 'OPTIN', 'OPT IN', 'YES', 'UNSTOP'];

@Injectable()
export class SmsInboundWorker implements OnModuleInit {
  private readonly logger = new Logger(SmsInboundWorker.name);

  constructor(
    private readonly queueService: QueueService,
    @InjectRepository(InboundSms)
    private readonly inboundSmsRepository: Repository<InboundSms>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(CampaignMessage)
    private readonly campaignMessageRepository: Repository<CampaignMessage>,
    @InjectRepository(SmsSender)
    private readonly smsSenderRepository: Repository<SmsSender>
  ) {}

  async onModuleInit(): Promise<void> {
    // Delay start to ensure connections are ready
    setTimeout(() => this.startConsuming(), 3000);
  }

  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available for SmsInboundWorker, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(WORKER_CONFIG.TRACKING.prefetch);

      await channel.consume(
        QUEUES.WEBHOOK_TWILIO_INBOUND.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: InboundSmsMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing inbound SMS: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('SMS Inbound Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start SMS Inbound Worker: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  private async processMessage(message: InboundSmsMessage): Promise<void> {
    const { messageSid, from, to, body, numMedia, mediaUrls, timestamp, tenantId, payload } =
      message;

    this.logger.debug(
      `Processing inbound SMS from ${from} to ${to}: "${body.substring(0, 50)}..."`
    );

    // Try to determine tenant from the receiving number if not provided
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      resolvedTenantId = await this.resolveTenantFromNumber(to);
    }

    if (!resolvedTenantId) {
      this.logger.warn(`Could not determine tenant for inbound SMS to ${to}`);
      // Still store the message but without tenant association
    }

    // Try to find matching contact by phone number
    const contact = await this.findContactByPhone(from, resolvedTenantId);

    // Try to find recent campaign message to link the reply
    const recentCampaignMessage = await this.findRecentCampaignMessage(from, to, resolvedTenantId);

    // Check for opt-out/opt-in keywords
    const normalizedBody = body.trim().toUpperCase();
    const isOptOut = OPT_OUT_KEYWORDS.some((keyword) => normalizedBody === keyword);
    const isOptIn = OPT_IN_KEYWORDS.some((keyword) => normalizedBody === keyword);

    // Handle opt-out
    if (isOptOut && contact) {
      await this.handleOptOut(contact);
      this.logger.log(`Contact ${contact.id} opted out via SMS`);
    }

    // Handle opt-in (re-subscription)
    if (isOptIn && contact) {
      await this.handleOptIn(contact);
      this.logger.log(`Contact ${contact.id} opted in via SMS`);
    }

    // Store the inbound message
    const inboundSms = this.inboundSmsRepository.create({
      tenantId: resolvedTenantId || undefined,
      fromNumber: from,
      toNumber: to,
      message: body,
      contactId: contact?.id,
      campaignId: recentCampaignMessage?.campaignId,
      campaignMessageId: recentCampaignMessage?.id,
      provider: 'twilio',
      externalId: messageSid,
      receivedAt: timestamp ? new Date(timestamp) : new Date(),
      processed: isOptOut || isOptIn, // Mark as processed if it was an opt-out/opt-in
      metadata: {
        numMedia,
        mediaUrls,
        isOptOut,
        isOptIn,
        rawPayload: payload,
      },
    });

    await this.inboundSmsRepository.save(inboundSms);

    // Update campaign message if this is a reply
    if (recentCampaignMessage) {
      // Store reply info in renderedContent field
      await this.campaignMessageRepository.update(recentCampaignMessage.id, {
        renderedContent: {
          ...(recentCampaignMessage.renderedContent || {}),
          replied: true,
          replyMessageId: inboundSms.id,
          replyReceivedAt: new Date().toISOString(),
        },
      });

      // Update campaign replied count
      await this.campaignMessageRepository.query(
        `UPDATE campaigns SET replied_count = replied_count + 1 WHERE id = $1`,
        [recentCampaignMessage.campaignId]
      );
    }

    // Update contact activity
    if (contact) {
      await this.contactRepository.update(contact.id, {
        lastActivityAt: new Date(),
        engagementScore: () => 'engagement_score + 5', // Boost score for reply
      });
    }

    this.logger.log(
      `Stored inbound SMS ${inboundSms.id} from ${from}${contact ? ` (contact: ${contact.id})` : ''}`
    );
  }

  private async resolveTenantFromNumber(toNumber: string): Promise<string | undefined> {
    // Try to find an SMS sender with this phone number
    const sender = await this.smsSenderRepository.findOne({
      where: { phoneNumber: toNumber },
      select: ['tenantId'],
    });

    return sender?.tenantId;
  }

  private async findContactByPhone(
    phoneNumber: string,
    tenantId?: string
  ): Promise<Contact | null> {
    // Normalize phone number for matching
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    const query = this.contactRepository.createQueryBuilder('contact');

    if (tenantId) {
      query.where('contact.tenantId = :tenantId', { tenantId });
    }

    // Try exact match first
    query.andWhere('contact.phone = :phone', { phone: phoneNumber });

    let contact = await query.getOne();

    // If not found, try normalized version
    if (!contact && normalizedPhone !== phoneNumber) {
      const normalizedQuery = this.contactRepository.createQueryBuilder('contact');
      if (tenantId) {
        normalizedQuery.where('contact.tenantId = :tenantId', { tenantId });
      }
      normalizedQuery.andWhere('contact.phone = :phone', { phone: normalizedPhone });
      contact = await normalizedQuery.getOne();
    }

    return contact;
  }

  private async findRecentCampaignMessage(
    fromNumber: string,
    toNumber: string,
    tenantId?: string
  ): Promise<CampaignMessage | null> {
    // Look for a recent outbound message to this phone number (within 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const query = this.campaignMessageRepository
      .createQueryBuilder('msg')
      .innerJoin('msg.campaign', 'campaign')
      .where('msg.recipientPhone = :fromNumber', { fromNumber })
      .andWhere('campaign.type = :type', { type: 'sms' })
      .andWhere('msg.sentAt >= :sevenDaysAgo', { sevenDaysAgo })
      .orderBy('msg.sentAt', 'DESC')
      .limit(1);

    if (tenantId) {
      query.andWhere('msg.tenantId = :tenantId', { tenantId });
    }

    return query.getOne();
  }

  private async handleOptOut(contact: Contact): Promise<void> {
    await this.contactRepository.update(contact.id, {
      smsStatus: ChannelStatus.UNSUBSCRIBED,
      lastActivityAt: new Date(),
    });
  }

  private async handleOptIn(contact: Contact): Promise<void> {
    await this.contactRepository.update(contact.id, {
      smsStatus: ChannelStatus.ACTIVE,
      lastActivityAt: new Date(),
    });
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      // Assume US number if 10 digits
      if (normalized.length === 10) {
        normalized = '+1' + normalized;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }
}
