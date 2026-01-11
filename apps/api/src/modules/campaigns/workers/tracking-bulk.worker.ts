import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConsumeMessage } from 'amqplib';
import { QueueService } from '@/providers/queue/queue.service';
import { RedisCounterService } from '@/providers/redis/redis-counter.service';
import { Campaign } from '../entities/campaign.entity';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import {
  QUEUES,
  TrackingEventMessage,
  TrackingBulkMessage,
  WORKER_CONFIG,
} from '@/providers/queue/queue.constants';

/**
 * Tracking Bulk Worker
 *
 * Processes tracking events in bulk to reduce database load.
 * Instead of writing each open/click immediately, events are
 * batched and processed together.
 */
@Injectable()
export class TrackingBulkWorker implements OnModuleInit {
  private readonly logger = new Logger(TrackingBulkWorker.name);

  // Buffer for batching events
  private eventBuffer: TrackingEventMessage[] = [];
  private readonly bufferSize = 100;
  private readonly flushIntervalMs = 5000;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
    private readonly counterService: RedisCounterService
  ) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => {
      this.startConsuming();
      this.startFlushTimer();
    }, 2000);
  }

  /**
   * Start consuming messages from the tracking events queue
   */
  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(WORKER_CONFIG.TRACKING.prefetch);

      // Consume individual tracking events
      await channel.consume(
        QUEUES.TRACKING_EVENTS.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const event: TrackingEventMessage = JSON.parse(msg.content.toString());
            await this.bufferEvent(event);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing tracking event: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      // Consume bulk tracking messages
      await channel.consume(
        QUEUES.TRACKING_BULK.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const bulk: TrackingBulkMessage = JSON.parse(msg.content.toString());
            await this.processBulk(bulk);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing bulk tracking: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('Tracking Bulk Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Start timer to flush buffer periodically
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, this.flushIntervalMs);
  }

  /**
   * Buffer an event for batch processing
   */
  private async bufferEvent(event: TrackingEventMessage): Promise<void> {
    this.eventBuffer.push(event);

    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Flush the event buffer to database
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.processEvents(events);
    } catch (error: any) {
      this.logger.error(`Error flushing buffer: ${error.message}`);
      // Put events back in buffer for retry
      this.eventBuffer.push(...events);
    }
  }

  /**
   * Process a bulk of tracking events
   */
  private async processBulk(bulk: TrackingBulkMessage): Promise<void> {
    await this.processEvents(bulk.events);
  }

  /**
   * Process multiple tracking events
   */
  private async processEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    this.logger.debug(`Processing ${events.length} tracking events`);

    // Group events by type for efficient processing
    const openEvents = events.filter((e) => e.type === 'open');
    const clickEvents = events.filter((e) => e.type === 'click');
    const unsubEvents = events.filter((e) => e.type === 'unsubscribe');
    const bounceEvents = events.filter((e) => e.type === 'bounce');
    const complaintEvents = events.filter((e) => e.type === 'complaint');

    // Process each type
    await Promise.all([
      this.processOpenEvents(openEvents),
      this.processClickEvents(clickEvents),
      this.processUnsubscribeEvents(unsubEvents),
      this.processBounceEvents(bounceEvents),
      this.processComplaintEvents(complaintEvents),
    ]);
  }

  /**
   * Process open events
   */
  private async processOpenEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const event of events) {
        // Check deduplication
        const isNew = await this.counterService.markOpenTracked(event.campaignId, event.messageId);

        if (isNew) {
          // Update message
          await queryRunner.manager.update(CampaignMessage, event.messageId, {
            status: MessageStatus.OPENED,
            openedAt: new Date(event.timestamp),
          });

          // Create event record
          await queryRunner.manager.save(CampaignEvent, {
            campaignMessageId: event.messageId,
            campaignId: event.campaignId,
            contactId: event.contactId,
            tenantId: event.tenantId,
            eventType: EventType.OPENED,
            metadata: event.metadata,
          });

          // Increment Redis counter
          await this.counterService.incrOpened(event.campaignId);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Process click events
   */
  private async processClickEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const event of events) {
        const urlIndex = event.metadata?.urlIndex || 0;
        const isNew = await this.counterService.markClickTracked(
          event.campaignId,
          event.messageId,
          urlIndex
        );

        if (isNew) {
          // Update message
          await queryRunner.manager.update(CampaignMessage, event.messageId, {
            status: MessageStatus.CLICKED,
            clickedAt: new Date(event.timestamp),
          });

          // Create event record
          await queryRunner.manager.save(CampaignEvent, {
            campaignMessageId: event.messageId,
            campaignId: event.campaignId,
            contactId: event.contactId,
            tenantId: event.tenantId,
            eventType: EventType.CLICKED,
            metadata: event.metadata,
          });

          // Increment Redis counter
          await this.counterService.incrClicked(event.campaignId);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Process unsubscribe events
   */
  private async processUnsubscribeEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    for (const event of events) {
      try {
        // Update message
        await this.messageRepository.update(event.messageId, {
          status: MessageStatus.UNSUBSCRIBED,
        });

        // Create event record
        await this.eventRepository.save({
          campaignMessageId: event.messageId,
          campaignId: event.campaignId,
          contactId: event.contactId,
          tenantId: event.tenantId,
          eventType: EventType.UNSUBSCRIBED,
          metadata: event.metadata,
        });

        // Increment counter
        await this.counterService.incrUnsubscribed(event.campaignId);
      } catch (error: any) {
        this.logger.error(`Error processing unsubscribe: ${error.message}`);
      }
    }
  }

  /**
   * Process bounce events
   */
  private async processBounceEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    for (const event of events) {
      try {
        // Update message
        await this.messageRepository.update(event.messageId, {
          status: MessageStatus.BOUNCED,
        });

        // Create event record
        await this.eventRepository.save({
          campaignMessageId: event.messageId,
          campaignId: event.campaignId,
          contactId: event.contactId,
          tenantId: event.tenantId,
          eventType: EventType.BOUNCED,
          metadata: event.metadata,
        });

        // Increment counter
        await this.counterService.incrBounced(event.campaignId);
      } catch (error: any) {
        this.logger.error(`Error processing bounce: ${error.message}`);
      }
    }
  }

  /**
   * Process complaint events
   */
  private async processComplaintEvents(events: TrackingEventMessage[]): Promise<void> {
    if (events.length === 0) return;

    for (const event of events) {
      try {
        // Update message
        await this.messageRepository.update(event.messageId, {
          status: MessageStatus.COMPLAINED,
        });

        // Create event record
        await this.eventRepository.save({
          campaignMessageId: event.messageId,
          campaignId: event.campaignId,
          contactId: event.contactId,
          tenantId: event.tenantId,
          eventType: EventType.COMPLAINED,
          metadata: event.metadata,
        });

        // Increment counter
        await this.counterService.incrComplained(event.campaignId);
      } catch (error: any) {
        this.logger.error(`Error processing complaint: ${error.message}`);
      }
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    // Flush remaining events
    this.flushBuffer().catch((err) => {
      this.logger.error(`Error flushing on destroy: ${err.message}`);
    });
  }
}
