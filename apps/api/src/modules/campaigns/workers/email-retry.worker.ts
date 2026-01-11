import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { QueueService } from '@/providers/queue/queue.service';
import { QUEUES, EmailRetryMessage, EmailSendMessage } from '@/providers/queue/queue.constants';

/**
 * Email Retry Worker
 *
 * This worker handles messages that need to be retried after a delay.
 * It simply forwards messages to the main email send queue.
 *
 * The retry logic is handled by the email-send.worker, which calculates
 * the appropriate backoff delay and publishes to this queue.
 */
@Injectable()
export class EmailRetryWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailRetryWorker.name);

  constructor(private readonly queueService: QueueService) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.startConsuming(), 2000);
  }

  /**
   * Start consuming messages from the email retry queue
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
        QUEUES.EMAIL_RETRY.name,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const message: EmailRetryMessage = JSON.parse(msg.content.toString());
            await this.processMessage(message);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`Error processing email retry: ${error.message}`, error.stack);
            // Send to DLQ
            channel.nack(msg, false, false);
          }
        },
        { noAck: false }
      );

      this.logger.log('Email Retry Worker started consuming');
    } catch (error: any) {
      this.logger.error(`Failed to start consuming: ${error.message}`);
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  /**
   * Process a retry message by forwarding to main send queue
   */
  async processMessage(message: EmailRetryMessage): Promise<void> {
    const { messageId, attempt, lastError, nextRetryAt } = message;

    this.logger.debug(
      `Retrying message ${messageId}, attempt ${attempt}, last error: ${lastError}`
    );

    // Check if it's time to retry
    if (nextRetryAt && new Date(nextRetryAt) > new Date()) {
      // Not yet time, put back in queue
      const delayMs = new Date(nextRetryAt).getTime() - Date.now();
      await this.queueService.publishEmailRetry(message, delayMs);
      return;
    }

    // Convert retry message to send message and publish to send queue
    const sendMessage: EmailSendMessage = {
      campaignId: message.campaignId,
      tenantId: message.tenantId,
      messageId: message.messageId,
      contactId: message.contactId,
      email: message.email,
      firstName: message.firstName,
      lastName: message.lastName,
      customFields: message.customFields,
      attempt: message.attempt,
    };

    await this.queueService.publishEmailSend(sendMessage);
  }
}
