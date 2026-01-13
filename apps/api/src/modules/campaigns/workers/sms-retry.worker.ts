import { QUEUES, SmsRetryMessage, SmsSendMessage } from '@/providers/queue/queue.constants';
import { QueueService } from '@/providers/queue/queue.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';

/**
 * SMS Retry Worker
 *
 * This worker handles SMS messages that need to be retried after a delay.
 * It simply forwards messages to the main SMS send queue.
 */
@Injectable()
export class SmsRetryWorker implements OnModuleInit {
  private readonly logger = new Logger(SmsRetryWorker.name);

  constructor(private readonly queueService: QueueService) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.startConsuming(), 2000);
  }

  /**
   * Start consuming messages from the SMS retry queue
   */
  private async startConsuming(): Promise<void> {
    const channel = this.queueService.getChannel();
    if (!channel) {
      this.logger.warn('RabbitMQ channel not available, retrying in 5s...');
      setTimeout(() => this.startConsuming(), 5000);
      return;
    }

    try {
      await channel.prefetch(10);

      await channel.consume(
        QUEUES.SMS_RETRY.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: SmsRetryMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing SMS retry: ${error.message}`, error.stack);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('SMS Retry Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Process a retry message by forwarding to main send queue
   */
  async processMessage(message: SmsRetryMessage): Promise<void> {
    const { messageId, attempt, lastError, nextRetryAt } = message;

    this.logger.debug(
      `Retrying SMS message ${messageId}, attempt ${attempt}, last error: ${lastError}`
    );

    // Check if it's time to retry
    if (nextRetryAt && new Date(nextRetryAt) > new Date()) {
      const delayMs = new Date(nextRetryAt).getTime() - Date.now();
      await this.queueService.publishSmsRetry(message, delayMs);
      return;
    }

    // Convert retry message to send message and publish to send queue
    const sendMessage: SmsSendMessage = {
      campaignId: message.campaignId,
      tenantId: message.tenantId,
      messageId: message.messageId,
      contactId: message.contactId,
      phoneNumber: message.phoneNumber,
      firstName: message.firstName,
      lastName: message.lastName,
      customFields: message.customFields,
      attempt: message.attempt,
    };

    await this.queueService.publishSmsSend(sendMessage);
  }
}
