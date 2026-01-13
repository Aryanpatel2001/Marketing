import { QUEUES, WebhookTwilioMessage, WORKER_CONFIG } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { SmsTrackingService } from '../services/sms-tracking.service';

@Injectable()
export class SmsTrackingWorker implements OnModuleInit {
  private readonly logger = new Logger(SmsTrackingWorker.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly trackingService: SmsTrackingService
  ) {}

  async onModuleInit(): Promise<void> {
    // Delay start to ensure connections are ready
    setTimeout(() => this.startConsuming(), 3000);
  }

  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available for SmsTrackingWorker, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(WORKER_CONFIG.TRACKING.prefetch);

      await channel.consume(
        QUEUES.WEBHOOK_TWILIO.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: WebhookTwilioMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing SMS tracking event: ${error.message}`, error.stack);
            // Nack without requeue for unrecoverable errors to avoid loops,
            // or requeue if transient. For parsing errors, we don't requeue.
            // For now, simpler to not requeue unknown errors.
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('SMS Tracking Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start SMS Tracking Worker: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  private async processMessage(message: WebhookTwilioMessage): Promise<void> {
    const { messageSid, messageStatus, errorCode, errorMessage, timestamp, tenantId, _campaignId } =
      message;

    if (!tenantId) {
      this.logger.warn(`Missing tenantId for SMS tracking message ${messageSid}`);
      return;
    }

    this.logger.debug(
      `Processing SMS tracking for message ${messageSid} (Status: ${messageStatus})`
    );

    await this.trackingService.processDeliveryStatus(
      messageSid, // Using Twilio MessageSid as the external ID
      {
        status: messageStatus as any,
        errorCode: errorCode,
        errorMessage: errorMessage,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        carrier: undefined, // Twilio often doesn't give this in standard callback unless requested
        countryCode: undefined, // Could parse from 'To' or 'From' but typically handled by provider
      },
      tenantId
    );
  }
}
