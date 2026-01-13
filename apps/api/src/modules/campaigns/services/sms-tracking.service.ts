import { DeliveryStatus } from '@/providers/sms/providers/sms-provider.interface';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { Campaign } from '../entities/campaign.entity';
import { SmsDeliveryReceipt, SmsDeliveryStatus } from '../entities/sms-delivery-receipt.entity';

@Injectable()
export class SmsTrackingService {
  private readonly logger = new Logger(SmsTrackingService.name);

  constructor(
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    @InjectRepository(SmsDeliveryReceipt)
    private readonly receiptRepository: Repository<SmsDeliveryReceipt>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Process a delivery status update from a provider
   */
  async processDeliveryStatus(
    messageId: string, // Internal message ID or External ID? Usually External ID from webhook
    statusData: DeliveryStatus,
    tenantId: string
  ): Promise<void> {
    const { status, errorCode, errorMessage, timestamp, carrier, countryCode } = statusData;

    // Find the message
    // Note: We might need to find by externalId if messageId passed is the provider's ID
    let message = await this.messageRepository.findOne({
      where: { externalId: messageId, tenantId },
    });

    if (!message) {
      // Try finding by internal ID if that matches
      message = await this.messageRepository.findOne({
        where: { id: messageId, tenantId },
      });
    }

    if (!message) {
      this.logger.warn(`SmsTrackingService: Message not found for ID ${messageId}`);
      return;
    }

    this.logger.log(
      `Processing SMS status for message ${message.id}: ${status} (Code: ${errorCode || 'N/A'})`
    );

    await this.dataSource.transaction(async (manager) => {
      // 1. Create Delivery Receipt Record
      const receipt = manager.create(SmsDeliveryReceipt, {
        campaignMessageId: message!.id,
        tenantId,
        status: this.mapToReceiptStatus(status),
        errorCode: errorCode,
        errorMessage: errorMessage,
        carrier: carrier,
        countryCode: countryCode,
        receivedAt: timestamp || new Date(),
      });
      await manager.save(receipt);

      // 2. Update Campaign Message Status
      const newMessageStatus = this.mapToMessageStatus(status);
      if (newMessageStatus && newMessageStatus !== message!.status) {
        const updateData: Partial<CampaignMessage> = {
          status: newMessageStatus,
        };

        if (newMessageStatus === MessageStatus.DELIVERED) {
          updateData.deliveredAt = timestamp || new Date();
        } else if (newMessageStatus === MessageStatus.FAILED) {
          // Verify if it's already failed to avoid overwriting error message with generic one if not provided
          // But usually latest status is most accurate
          updateData.failedAt = timestamp || new Date();
          updateData.errorMessage = errorMessage || errorCode || 'Delivery failed';
        }

        await manager.update(CampaignMessage, message!.id, updateData as any);
      }

      // 3. Create Campaign Event
      const eventType = this.mapToEventType(status);
      if (eventType) {
        const event = manager.create(CampaignEvent, {
          campaignMessageId: message!.id,
          campaignId: message!.campaignId,
          contactId: message!.contactId,
          tenantId,
          eventType,
          metadata: {
            errorCode,
            errorMessage,
            carrier,
            externalId: messageId,
          },
        });
        await manager.save(event);
      }

      // 4. Update Campaign Stats (Atomic increment)
      await this.updateCampaignStats(manager, message!.campaignId, status);
    });
  }

  /**
   * Map provider status to receipt status
   */
  private mapToReceiptStatus(status: string): SmsDeliveryStatus {
    switch (status.toLowerCase()) {
      case 'sent':
        return SmsDeliveryStatus.SENT;
      case 'delivered':
        return SmsDeliveryStatus.DELIVERED;
      case 'failed':
        return SmsDeliveryStatus.FAILED;
      case 'undelivered':
        return SmsDeliveryStatus.UNDELIVERED;
      case 'queued':
        return SmsDeliveryStatus.QUEUED;
      default:
        return SmsDeliveryStatus.QUEUED;
    }
  }

  /**
   * Map provider status to campaign message status
   */
  private mapToMessageStatus(status: string): MessageStatus | null {
    switch (status.toLowerCase()) {
      case 'sent':
        return MessageStatus.SENT;
      case 'delivered':
        return MessageStatus.DELIVERED;
      case 'failed':
      case 'undelivered':
        return MessageStatus.FAILED;
      default:
        return null;
    }
  }

  /**
   * Map provider status to event type
   */
  private mapToEventType(status: string): EventType | null {
    switch (status.toLowerCase()) {
      case 'sent':
        return EventType.SENT;
      case 'delivered':
        return EventType.DELIVERED;
      case 'failed':
      case 'undelivered':
        return EventType.FAILED;
      default:
        return null;
    }
  }

  /**
   * Update campaign counters atomically
   */
  private async updateCampaignStats(
    manager: any,
    campaignId: string,
    status: string
  ): Promise<void> {
    const statusLower = status.toLowerCase();

    // Note: SENT is typically incremented by the sender worker, not receipt
    // But IF the provider says "sent" now (maybe after queuing), we could track it?
    // Usually worker does SENT. We care about DELIVERED and FAILED here.

    if (statusLower === 'delivered') {
      await manager
        .createQueryBuilder()
        .update(Campaign)
        .set({ deliveredCount: () => '"delivered_count" + 1' })
        .where('id = :id', { id: campaignId })
        .execute();
    } else if (statusLower === 'failed' || statusLower === 'undelivered') {
      // NOTE: Sender worker might have already incremented failedCount if immediate failure.
      // If this is a later failure (delivery receipt), we should ideally check if it was already counted?
      // For now, we assume late failures are new info.
      // However, be careful not to double count if the worker failed it too.
      // But typically worker failures prevent sending, so no external ID.
      // These are post-send failures.
      // Just in case, this might need refinement, but incrementing is standard for "bounced/failed" events.
      await manager
        .createQueryBuilder()
        .update(Campaign)
        .set({ failedCount: () => '"failed_count" + 1' })
        .where('id = :id', { id: campaignId })
        .execute();
    }
  }
}
