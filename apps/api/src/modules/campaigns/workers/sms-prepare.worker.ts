import { ContactListMember } from '@/modules/contacts/entities/contact-list-member.entity';
import { ChannelStatus, Contact, ContactStatus } from '@/modules/contacts/entities/contact.entity';
import { QUEUES, SmsPrepareMessage, SmsSendMessage } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCacheService } from '@/providers/redis/redis-cache.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { SmsService } from '@/providers/sms/sms.service';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConsumeMessage } from 'amqplib';
import { DataSource, In, Repository } from 'typeorm';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';

@Injectable()
export class SmsPrepareWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsPrepareWorker.name);
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
    private readonly smsService: SmsService,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.startConsuming(), 2000);
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('SMS Prepare Worker shutting down gracefully...');
  }

  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(1);

      await channel.consume(
        QUEUES.SMS_PREPARE.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: SmsPrepareMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing SMS prepare: ${error.message}`, error.stack);
            channel.nack(msg, false, true);
          }
        },
        { noAck: false }
      );

      this.logger.log('SMS Prepare Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  async processMessage(message: SmsPrepareMessage): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug('Worker shutting down, requeueing prepare message');
      await this.queueService.publishSmsPrepare(message);
      return;
    }

    const { campaignId, tenantId, batchSize = 100 } = message;

    this.logger.log(`Preparing SMS campaign ${campaignId} for sending`);

    const lockAcquired = await this.counterService.acquireLock(`prepare:sms:${campaignId}`, 600);
    if (!lockAcquired) {
      this.logger.warn(`Campaign ${campaignId} is already being prepared`);
      return;
    }

    try {
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId, tenantId },
      });

      if (!campaign) {
        this.logger.error(`Campaign ${campaignId} not found`);
        return;
      }

      if (
        campaign.status !== CampaignStatus.DRAFT &&
        campaign.status !== CampaignStatus.SCHEDULED
      ) {
        this.logger.warn(`Campaign ${campaignId} is in ${campaign.status} status, skipping`);
        return;
      }

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
        `[SMS CAMPAIGN STARTING] ID: ${campaignId} | Recipients: ${recipientCount} | StartTime: ${startedAt.toISOString()} | Mode: ${message.isDryRun ? 'DRY RUN' : 'NORMAL'}`
      );

      await this.campaignRepository.update(campaignId, {
        status: message.isDryRun ? CampaignStatus.PREPARING : CampaignStatus.SENDING,
        startedAt: message.isDryRun ? undefined : startedAt,
        totalRecipients: recipientCount,
      });

      await this.counterService.initCampaignStats(campaignId);
      await this.cacheService.setCampaignProgress(campaignId, {
        sent: 0,
        failed: 0,
        total: recipientCount,
        status: message.isDryRun ? 'preparing' : 'sending',
      });

      const createdCount = await this.createCampaignMessagesStreaming(
        campaign,
        batchSize,
        message.isDryRun
      );

      if (createdCount !== recipientCount) {
        await this.campaignRepository.update(campaignId, {
          totalRecipients: createdCount,
        });
        await this.cacheService.setCampaignProgress(campaignId, {
          total: createdCount,
        });
      }

      if (message.isDryRun) {
        await this.campaignRepository.update(campaignId, {
          status: CampaignStatus.READY,
        });
        this.logger.log(`Campaign ${campaignId} prepared (dry run) and ready for release`);
      } else {
        await this.queueMessagesForSending(campaign, batchSize);
      }

      await this.counterService.extendLock(`prepare:sms:${campaignId}`, 300);

      if (!message.isDryRun) {
        this.logger.log(`Campaign ${campaignId} prepared and queued for sending`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing SMS campaign ${campaignId}: ${error.message}`,
        error.stack
      );

      await this.campaignRepository.update(campaignId, {
        status: CampaignStatus.FAILED,
        completedAt: new Date(),
      });
    } finally {
      await this.counterService.releaseLock(`prepare:sms:${campaignId}`);
    }
  }

  private async getRecipientCount(campaign: Campaign): Promise<number> {
    const { tenantId, audienceType, contactListIds } = campaign;

    let query = this.contactRepository
      .createQueryBuilder('contact')
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
      if (contactIds.length === 0) return 0;

      query = query.andWhere('contact.id IN (:...contactIds)', { contactIds });
    }

    return query.getCount();
  }

  private async createCampaignMessagesStreaming(
    campaign: Campaign,
    batchSize: number,
    isDryRun = false
  ): Promise<number> {
    const { tenantId, audienceType, contactListIds } = campaign;
    let createdCount = 0;
    let lastId: string | null = null;

    let listContactIds: string[] | null = null;
    if (audienceType === 'list' && contactListIds && contactListIds.length > 0) {
      const listMembers = await this.listMemberRepository.find({
        where: { contactListId: In(contactListIds) },
        select: ['contactId'],
      });
      listContactIds = [...new Set(listMembers.map((m) => m.contactId))];
      if (listContactIds.length === 0) return 0;
    }

    let hasMoreContacts = true;
    while (hasMoreContacts) {
      let query = this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.tenantId = :tenantId', { tenantId })
        .andWhere('contact.deletedAt IS NULL')
        .andWhere('contact.status = :status', { status: ContactStatus.ACTIVE })
        .andWhere('contact.phone IS NOT NULL')
        .andWhere("contact.phone != ''")
        .andWhere('contact.smsStatus = :smsStatus', { smsStatus: ChannelStatus.ACTIVE })
        .orderBy('contact.id', 'ASC')
        .take(batchSize);

      if (listContactIds) {
        query = query.andWhere('contact.id IN (:...listContactIds)', { listContactIds });
      }

      if (lastId) {
        query = query.andWhere('contact.id > :lastId', { lastId });
      }

      const contacts = await query.getMany();

      if (contacts.length === 0) {
        hasMoreContacts = false;
        break;
      }

      lastId = contacts[contacts.length - 1].id;

      const validContacts = contacts.filter(
        (contact) => this.smsService.validatePhoneNumber(contact.phone!).valid
      );

      if (validContacts.length === 0) continue;

      const messages = validContacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        tenantId: campaign.tenantId,
        recipientPhone: contact.phone,
        recipientName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
        status: isDryRun ? MessageStatus.PREPARED : MessageStatus.QUEUED,
        queuedAt: new Date(),
      }));

      const entities = this.messageRepository.create(messages);
      await this.messageRepository.save(entities, { chunk: batchSize });

      createdCount += messages.length;

      if (createdCount % 1000 === 0) {
        this.logger.log(
          `Created ${createdCount} campaign messages for SMS campaign ${campaign.id}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    return createdCount;
  }

  private async queueMessagesForSending(campaign: Campaign, batchSize: number): Promise<void> {
    let queuedCount = 0;
    let lastId: string | null = null;

    let hasMoreMessages = true;
    while (hasMoreMessages) {
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

      lastId = messages[messages.length - 1].id;

      const sendMessages: SmsSendMessage[] = [];
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
        const result = await this.queueService.publishSmsSendBatch(sendMessages);
        queuedCount += result.success;
      }

      if (queuedCount % 1000 === 0) {
        this.logger.log(`Queued ${queuedCount} SMS messages for campaign ${campaign.id}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
