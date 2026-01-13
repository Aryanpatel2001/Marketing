import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { Contact } from '@/modules/contacts/entities/contact.entity';
import {
  BullSmsQueueService,
  SmsBatchJob,
  SmsMessageJob,
  SmsPriority,
} from '@/providers/queue/bull-sms-queue.service';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign, CampaignStatus, SmsContent } from '../entities/campaign.entity';

export interface CampaignBatch {
  batchId: string;
  campaignId: string;
  tenantId: string;
  batchNumber: number;
  totalBatches: number;
  messages: SmsMessageJob[];
  priority: SmsPriority;
}

export interface SplitResult {
  campaignId: string;
  totalRecipients: number;
  totalBatches: number;
  batches: CampaignBatch[];
  estimatedDurationSeconds: number;
}

@Injectable()
export class CampaignSplitterService {
  private readonly logger = new Logger(CampaignSplitterService.name);

  // Configuration
  private readonly batchSize: number;
  private readonly maxBatchesPerCampaign: number;
  private readonly messagesPerSecond: number;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly bullSmsQueue: BullSmsQueueService,
    private readonly configService: ConfigService
  ) {
    this.batchSize = this.configService.get<number>('SMS_BATCH_SIZE', 500);
    this.maxBatchesPerCampaign = this.configService.get<number>('SMS_MAX_BATCHES', 100);
    this.messagesPerSecond = this.configService.get<number>('SMS_RATE_LIMIT', 100);

    this.logger.log(
      `CampaignSplitterService initialized: batchSize=${this.batchSize}, ` +
        `maxBatches=${this.maxBatchesPerCampaign}, rate=${this.messagesPerSecond}/sec`
    );
  }

  /**
   * Split a campaign into batches and queue for processing
   */
  async splitAndQueueCampaign(campaignId: string, tenantId: string): Promise<SplitResult> {
    this.logger.log(`[SPLIT] Starting campaign split: ${campaignId}`);

    // Load campaign
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Get recipients from segments
    const recipients = await this.getRecipients(campaign, tenantId);

    if (recipients.length === 0) {
      throw new Error('No recipients found for campaign');
    }

    this.logger.log(`[SPLIT] Found ${recipients.length} recipients for campaign ${campaignId}`);

    // Determine priority based on plan (could be extended)
    const priority = this.determinePriority(tenantId);

    // Split into batches
    const batches = this.createBatches(campaign, recipients, priority);

    // Create message records in database
    await this.createMessageRecords(campaign, recipients, tenantId);

    // Update campaign status and totals
    await this.campaignRepository.update(campaignId, {
      status: CampaignStatus.SENDING,
      totalRecipients: recipients.length,
    });

    // Queue batches for processing
    await this.queueBatches(batches);

    const estimatedDurationSeconds = Math.ceil(recipients.length / this.messagesPerSecond);

    this.logger.log(
      `[SPLIT] Campaign ${campaignId} split into ${batches.length} batches, ` +
        `estimated duration: ${estimatedDurationSeconds}s`
    );

    return {
      campaignId,
      totalRecipients: recipients.length,
      totalBatches: batches.length,
      batches,
      estimatedDurationSeconds,
    };
  }

  /**
   * Get recipients from campaign contact lists
   */
  private async getRecipients(campaign: Campaign, tenantId: string): Promise<Contact[]> {
    const contactListIds = campaign.contactListIds || [];

    // Get contacts from contact lists or all contacts with phone numbers
    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.phone IS NOT NULL')
      .andWhere('contact.phone != :empty', { empty: '' });

    // If contact lists are specified, filter by them
    if (contactListIds.length > 0) {
      query.innerJoin(
        'contact_list_members',
        'clm',
        'clm.contact_id = contact.id AND clm.contact_list_id IN (:...listIds)',
        { listIds: contactListIds }
      );
    }

    return query.getMany();
  }

  /**
   * Create batches from recipients
   */
  private createBatches(
    campaign: Campaign,
    recipients: Contact[],
    priority: SmsPriority
  ): CampaignBatch[] {
    const batches: CampaignBatch[] = [];
    const content = campaign.content as SmsContent;
    const messageTemplate = content.message || '';
    const senderId = content.senderId;

    const totalBatches = Math.min(
      Math.ceil(recipients.length / this.batchSize),
      this.maxBatchesPerCampaign
    );

    for (let i = 0; i < recipients.length; i += this.batchSize) {
      const batchRecipients = recipients.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;

      const messages: SmsMessageJob[] = batchRecipients.map((contact) => ({
        messageId: uuidv4(),
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        contactId: contact.id,
        phoneNumber: contact.phone!,
        content: messageTemplate,
        senderId,
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        customFields: contact.customFields as Record<string, any> | undefined,
        attempt: 1,
      }));

      batches.push({
        batchId: `${campaign.id}-batch-${batchNumber}`,
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        batchNumber,
        totalBatches,
        messages,
        priority,
      });

      // Limit batches
      if (batches.length >= this.maxBatchesPerCampaign) {
        this.logger.warn(
          `Campaign ${campaign.id} exceeded max batches (${this.maxBatchesPerCampaign}), truncating`
        );
        break;
      }
    }

    return batches;
  }

  /**
   * Create message records in database
   */
  private async createMessageRecords(
    campaign: Campaign,
    recipients: Contact[],
    tenantId: string
  ): Promise<void> {
    const content = campaign.content as SmsContent;
    const messageTemplate = content.message || '';

    // Create records in batches to avoid memory issues
    const BATCH_SIZE = 1000;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batchRecipients = recipients.slice(i, i + BATCH_SIZE);

      const messageRecords = batchRecipients.map((contact) => ({
        id: uuidv4(),
        campaignId: campaign.id,
        tenantId,
        contactId: contact.id,
        channel: 'sms' as const,
        recipient: contact.phone,
        content: { body: messageTemplate },
        status: MessageStatus.QUEUED,
        createdAt: new Date(),
      }));

      await this.messageRepository
        .createQueryBuilder()
        .insert()
        .into(CampaignMessage)
        .values(messageRecords)
        .execute();
    }

    this.logger.log(`Created ${recipients.length} message records for campaign ${campaign.id}`);
  }

  /**
   * Queue batches for processing
   */
  private async queueBatches(batches: CampaignBatch[]): Promise<void> {
    const batchJobs: SmsBatchJob[] = batches.map((batch) => ({
      campaignId: batch.campaignId,
      tenantId: batch.tenantId,
      batchId: batch.batchId,
      messages: batch.messages,
      priority: batch.priority,
    }));

    await this.bullSmsQueue.addBatchJobs(batchJobs);
    this.logger.log(`Queued ${batchJobs.length} batch jobs`);
  }

  /**
   * Determine priority based on tenant plan
   */
  private determinePriority(tenantId: string): SmsPriority {
    // TODO: Look up tenant plan and return appropriate priority
    // For now, return NORMAL
    return SmsPriority.NORMAL;
  }

  /**
   * Estimate send duration for a campaign
   */
  estimateDuration(recipientCount: number): {
    seconds: number;
    formatted: string;
  } {
    const seconds = Math.ceil(recipientCount / this.messagesPerSecond);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    let formatted: string;
    if (minutes > 0) {
      formatted = `${minutes}m ${remainingSeconds}s`;
    } else {
      formatted = `${seconds}s`;
    }

    return { seconds, formatted };
  }

  /**
   * Get batch progress for a campaign
   */
  async getBatchProgress(campaignId: string): Promise<{
    totalBatches: number;
    completedBatches: number;
    pendingBatches: number;
    failedBatches: number;
  }> {
    const stats = await this.bullSmsQueue.getQueueStats();

    // This is a simplified version - in production you'd track batch completion separately
    return {
      totalBatches: 0,
      completedBatches: stats.sendBatch.completed,
      pendingBatches: stats.sendBatch.waiting + stats.sendBatch.delayed,
      failedBatches: stats.sendBatch.failed,
    };
  }
}
