import { ContactListMember } from '@/modules/contacts/entities/contact-list-member.entity';
import { ChannelStatus, Contact, ContactStatus } from '@/modules/contacts/entities/contact.entity';
import { EmailPrepareMessage, EmailSendMessage, QUEUES } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConsumeMessage } from 'amqplib';
import { DataSource, In, Repository } from 'typeorm';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus, CampaignType } from '../entities/campaign.entity';

// RFC 5322 compliant email regex
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Blocked disposable email domains
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

@Injectable()
export class EmailPrepareWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailPrepareWorker.name);
  private isShuttingDown = false;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(ContactListMember)
    private readonly listMemberRepository: Repository<ContactListMember>,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService,
    private readonly cacheService: RedisCacheService,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    // Start consuming after a short delay to ensure RabbitMQ is connected
    setTimeout(() => this.startConsuming(), 2000);
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('Email Prepare Worker shutting down gracefully...');
  }

  /**
   * Start consuming messages from the email prepare queue
   */
  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(1); // Process one campaign at a time

      await channel.consume(
        QUEUES.EMAIL_PREPARE.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: EmailPrepareMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing email prepare: ${error.message}`, error.stack);
            // Reject and requeue on error
            channel.nack(msg, false, true);
          }
        },
        { noAck: false }
      );

      this.logger.log('Email Prepare Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Process a campaign prepare message
   */
  async processMessage(message: EmailPrepareMessage): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug('Worker shutting down, requeueing prepare message');
      await this.queueService.publishEmailPrepare(message);
      return;
    }

    const { campaignId, tenantId, batchSize = 100 } = message;

    this.logger.log(`Preparing campaign ${campaignId} for sending`);

    // Acquire lock to prevent duplicate processing (10 minute TTL for large campaigns)
    const lockAcquired = await this.counterService.acquireLock(`prepare:${campaignId}`, 600);
    if (!lockAcquired) {
      this.logger.warn(`Campaign ${campaignId} is already being prepared`);
      return;
    }

    try {
      // Load campaign
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId, tenantId },
      });

      if (!campaign) {
        this.logger.error(`Campaign ${campaignId} not found`);
        return;
      }

      // Validate campaign status
      if (
        campaign.status !== CampaignStatus.DRAFT &&
        campaign.status !== CampaignStatus.SCHEDULED
      ) {
        this.logger.warn(`Campaign ${campaignId} is in ${campaign.status} status, skipping`);
        return;
      }

      // Get recipient count first (doesn't load all data into memory)
      const recipientCount = await this.getRecipientCount(campaign);

      if (recipientCount === 0) {
        this.logger.warn(`No valid recipients for campaign ${campaignId}`);
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.FAILED,
          completedAt: new Date(),
        });
        return;
      }

      const startedAt = new Date();
      this.logger.log(
        `[CAMPAIGN STARTING] ID: ${campaignId} | Recipients: ${recipientCount} | StartTime: ${startedAt.toISOString()} | Mode: ${message.isDryRun ? 'DRY RUN' : 'NORMAL'}`
      );

      // Update campaign status
      await this.campaignRepository.update(campaignId, {
        status: message.isDryRun ? CampaignStatus.PREPARING : CampaignStatus.SENDING,
        startedAt: message.isDryRun ? undefined : startedAt, // Only set startedAt when actually sending
        totalRecipients: recipientCount,
      });

      // Initialize Redis stats
      await this.counterService.initCampaignStats(campaignId);
      await this.cacheService.setCampaignProgress(campaignId, {
        sent: 0,
        failed: 0,
        total: recipientCount,
        status: message.isDryRun ? 'preparing' : 'sending',
      });

      // Create campaign messages using streaming (memory efficient)
      // Pass isDryRun to set capability specific status
      const createdCount = await this.createCampaignMessagesStreaming(
        campaign,
        batchSize,
        message.isDryRun
      );

      // Update total if different (due to filtering)
      if (createdCount !== recipientCount) {
        await this.campaignRepository.update(campaignId, {
          totalRecipients: createdCount,
        });
        await this.cacheService.setCampaignProgress(campaignId, {
          total: createdCount,
        });
      }

      if (message.isDryRun) {
        // In dry run, we stop here and mark as READY
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.READY,
        });
        this.logger.log(`Campaign ${campaignId} prepared (dry run) and ready for release`);
      } else {
        // Queue messages for sending in batches
        await this.queueMessagesForSending(campaign, batchSize);
      }

      // Extend lock TTL periodically during long operations
      await this.counterService.extendLock(`prepare:${campaignId}`, 300);

      if (!message.isDryRun) {
        this.logger.log(`Campaign ${campaignId} prepared and queued for sending`);
      }
    } catch (error: any) {
      this.logger.error(`Error preparing campaign ${campaignId}: ${error.message}`, error.stack);

      await this.campaignRepository.update(campaignId, {
        status: CampaignStatus.FAILED,
        completedAt: new Date(),
      });
    } finally {
      await this.counterService.releaseLock(`prepare:${campaignId}`);
    }
  }

  /**
   * Get recipient count without loading all data
   */
  private async getRecipientCount(campaign: Campaign): Promise<number> {
    const { tenantId, type, audienceType, contactListIds } = campaign;

    let query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE });

    if (type === CampaignType.EMAIL) {
      query = query
        .andWhere('contact.email IS NOT NULL')
        .andWhere("contact.email != ''")
        .andWhere('contact.emailStatus = :emailStatus', { emailStatus: ChannelStatus.ACTIVE });
    }

    if (audienceType === 'list' && contactListIds && contactListIds.length > 0) {
      const listMembers = await this.listMemberRepository.find({
        where: { contactListId: In(contactListIds) },
        select: ['contactId'],
      });

      const contactIds = [...new Set(listMembers.map((m) => m.contactId))];
      if (contactIds.length === 0) return 0;

      query = query.andWhere('contact.id IN (:...contactIds)', { contactIds });
    }

    return query.getCount();
  }

  /**
   * Get valid recipients for a campaign
   */
  private async getRecipients(campaign: Campaign): Promise<Contact[]> {
    const { tenantId, type, audienceType, contactListIds } = campaign;

    let query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE });

    // Filter by channel
    if (type === CampaignType.EMAIL) {
      query = query
        .andWhere('contact.email IS NOT NULL')
        .andWhere("contact.email != ''")
        .andWhere('contact.emailStatus = :emailStatus', { emailStatus: ChannelStatus.ACTIVE });
    }

    // Filter by list if specific lists selected
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

    // Additional email validation
    if (type === CampaignType.EMAIL) {
      return contacts.filter((contact) => this.isValidEmail(contact.email));
    }

    return contacts;
  }

  /**
   * Validate email address
   */
  private isValidEmail(email: string | null): boolean {
    if (!email) return false;

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) return false;

    const domain = trimmed.split('@')[1];
    if (BLOCKED_EMAIL_DOMAINS.includes(domain)) return false;

    if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) {
      return false;
    }

    return true;
  }

  /**
   * Create campaign message records
   */
  private async createCampaignMessages(
    campaign: Campaign,
    contacts: Contact[],
    batchSize: number
  ): Promise<void> {
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
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const entities = this.messageRepository.create(batch);
      await this.messageRepository.save(entities);
    }

    this.logger.log(`Created ${messages.length} campaign messages for campaign ${campaign.id}`);
  }

  /**
   * Create campaign messages using streaming (memory efficient for large campaigns)
   */
  private async createCampaignMessagesStreaming(
    campaign: Campaign,
    batchSize: number,
    isDryRun = false
  ): Promise<number> {
    const { tenantId, type, audienceType, contactListIds } = campaign;
    let createdCount = 0;
    let lastId: string | null = null;

    // Get contact IDs from list if using list audience
    let listContactIds: string[] | null = null;
    if (audienceType === 'list' && contactListIds && contactListIds.length > 0) {
      const listMembers = await this.listMemberRepository.find({
        where: { contactListId: In(contactListIds) },
        select: ['contactId'],
      });
      listContactIds = [...new Set(listMembers.map((m) => m.contactId))];
      if (listContactIds.length === 0) {
        this.logger.warn(`No contacts in selected lists for campaign ${campaign.id}`);
        return 0;
      }
    }

    let hasMoreContacts = true;
    while (hasMoreContacts) {
      // Build query with cursor-based pagination
      let query = this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.tenantId = :tenantId', { tenantId })
        .andWhere('contact.deletedAt IS NULL')
        .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE })
        .orderBy('contact.id', 'ASC')
        .take(batchSize);

      // Filter by channel type
      if (type === CampaignType.EMAIL) {
        query = query
          .andWhere('contact.email IS NOT NULL')
          .andWhere("contact.email != ''")
          .andWhere('contact.emailStatus = :emailStatus', { emailStatus: ChannelStatus.ACTIVE });
      }

      // Filter by list contacts if applicable
      if (listContactIds) {
        query = query.andWhere('contact.id IN (:...listContactIds)', { listContactIds });
      }

      // Apply cursor for pagination
      if (lastId) {
        query = query.andWhere('contact.id > :lastId', { lastId });
      }

      const contacts = await query.getMany();

      if (contacts.length === 0) {
        hasMoreContacts = false;
        break;
      }

      // Update cursor for next iteration
      lastId = contacts[contacts.length - 1].id;

      // Filter valid emails and create message records
      const validContacts =
        type === CampaignType.EMAIL
          ? contacts.filter((contact) => this.isValidEmail(contact.email))
          : contacts;

      if (validContacts.length === 0) continue;

      // Create campaign messages for this batch
      const messages = validContacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        tenantId: campaign.tenantId,
        recipientEmail: contact.email,
        recipientPhone: contact.phone,
        recipientName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
        status: isDryRun ? MessageStatus.PREPARED : MessageStatus.QUEUED,
        queuedAt: new Date(),
      }));

      // Batch insert using save with chunking disabled for performance
      const entities = this.messageRepository.create(messages);
      await this.messageRepository.save(entities, { chunk: batchSize });

      createdCount += messages.length;

      // Log progress every 1000 contacts
      if (createdCount % 1000 === 0) {
        this.logger.log(`Created ${createdCount} campaign messages for campaign ${campaign.id}`);
      }

      // Small delay to prevent overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    this.logger.log(`Total ${createdCount} campaign messages created for campaign ${campaign.id}`);
    return createdCount;
  }

  /**
   * Queue messages for sending using cursor-based pagination
   */
  private async queueMessagesForSending(campaign: Campaign, batchSize: number): Promise<void> {
    let queuedCount = 0;
    let lastId: string | null = null;

    let hasMoreMessages = true;
    while (hasMoreMessages) {
      // Use cursor-based pagination for consistency
      let query = this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.contact', 'contact')
        .where('message.campaignId = :campaignId', { campaignId: campaign.id })
        .andWhere('message.status = :status', { status: MessageStatus.QUEUED })
        .orderBy('message.id', 'ASC')
        .take(batchSize);

      if (lastId) {
        query = query.andWhere('message.id > :lastId', { lastId });
      }

      const messages = await query.getMany();

      if (messages.length === 0) {
        hasMoreMessages = false;
        break;
      }

      // Update lastId for next iteration
      lastId = messages[messages.length - 1].id;

      // Prepare batch of messages to queue
      const sendMessages: EmailSendMessage[] = [];
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

      // Batch publish for better throughput
      if (sendMessages.length > 0) {
        const result = await this.queueService.publishEmailSendBatch(sendMessages);
        queuedCount += result.success;

        if (result.failed > 0) {
          this.logger.warn(`Failed to queue ${result.failed} messages for campaign ${campaign.id}`);
        }
      }

      // Log progress
      if (queuedCount % 1000 === 0) {
        this.logger.log(
          `Queued ${queuedCount}/${campaign.totalRecipients} messages for campaign ${campaign.id}`
        );
      }

      // Small delay to prevent overwhelming RabbitMQ
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    this.logger.log(`Total ${queuedCount} messages queued for campaign ${campaign.id}`);
  }
}
