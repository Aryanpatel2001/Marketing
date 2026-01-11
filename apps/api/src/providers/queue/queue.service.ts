import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { Channel, ChannelModel } from 'amqplib';
import {
  CampaignLifecycleMessage,
  EmailBatchMessage,
  EmailPrepareMessage,
  EmailRetryMessage,
  EmailSendMessage,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
  StatsSyncMessage,
  TrackingBulkMessage,
  TrackingEventMessage,
  WebhookSESMessage,
} from './queue.constants';

export interface PublishOptions {
  persistent?: boolean;
  priority?: number;
  expiration?: string;
  headers?: Record<string, any>;
  delay?: number; // Delay in milliseconds (using x-delay plugin or delayed message exchange)
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Connect to RabbitMQ and setup exchanges/queues
   */
  async connect(): Promise<void> {
    let rabbitUrl = this.configService.get<string>(
      'rabbitmq.url',
      'amqp://guest:guest@localhost:5672'
    );

    // Fix for RabbitMQ connection reset (frame size negotiation)
    if (!rabbitUrl.includes('frameMax')) {
      rabbitUrl += rabbitUrl.includes('?') ? '&frameMax=131072' : '?frameMax=131072';
    }

    try {
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      this.isConnected = true;

      // Handle connection events
      this.connection.on('error', (error: Error) => {
        this.logger.error(`RabbitMQ connection error: ${error.message}`);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        // Attempt reconnection
        setTimeout(() => this.connect(), 5000);
      });

      await this.setupExchangesAndQueues();
      this.logger.log('RabbitMQ connected and configured successfully');
    } catch (error: any) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      this.isConnected = false;
      // Retry connection
      setTimeout(() => this.connect(), 10000);
    }
  }

  /**
   * Setup exchanges and queues
   */
  private async setupExchangesAndQueues(): Promise<void> {
    if (!this.channel) {
      this.logger.error('Cannot setup queues - channel not available');
      return;
    }

    try {
      // Create exchanges
      for (const exchange of Object.values(EXCHANGES)) {
        await this.channel.assertExchange(exchange.name, exchange.type, exchange.options);
        this.logger.log(`Exchange ${exchange.name} (${exchange.type}) created`);
      }

      // Create queues and bindings
      for (const queue of Object.values(QUEUES)) {
        const exchange = (queue as any).exchange || EXCHANGES.CAMPAIGNS.name;

        // Transform custom options to amqplib format
        const queueOptions = this.transformQueueOptions(queue.options);

        await this.channel.assertQueue(queue.name, queueOptions);
        await this.channel.bindQueue(queue.name, exchange, queue.routingKey);
        this.logger.log(`Queue ${queue.name} bound to ${exchange} with key ${queue.routingKey}`);
      }

      this.logger.log(`Successfully created ${Object.keys(QUEUES).length} queues`);
    } catch (error: any) {
      this.logger.error(`Failed to setup exchanges/queues: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Transform queue options to amqplib format
   * Converts our custom option names to x-prefixed arguments
   */
  private transformQueueOptions(options: any): amqp.Options.AssertQueue {
    const { deadLetterExchange, deadLetterRoutingKey, messageTtl, maxLength, ...rest } = options;

    const transformed: amqp.Options.AssertQueue = {
      ...rest,
      arguments: {},
    };

    if (deadLetterExchange && transformed.arguments) {
      transformed.arguments['x-dead-letter-exchange'] = deadLetterExchange;
    }
    if (deadLetterRoutingKey && transformed.arguments) {
      transformed.arguments['x-dead-letter-routing-key'] = deadLetterRoutingKey;
    }
    if (messageTtl && transformed.arguments) {
      transformed.arguments['x-message-ttl'] = messageTtl;
    }
    if (maxLength && transformed.arguments) {
      transformed.arguments['x-max-length'] = maxLength;
    }

    return transformed;
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ disconnected');
    } catch (error: any) {
      this.logger.error(`Error disconnecting from RabbitMQ: ${error.message}`);
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.channel !== null;
  }

  /**
   * Get the channel for consumers
   */
  getChannel(): amqp.Channel | null {
    return this.channel;
  }

  /**
   * Manually trigger setup (for debugging)
   */
  async manualSetup(): Promise<{ success: boolean; error?: string; details?: any }> {
    if (!this.channel) {
      return { success: false, error: 'No channel available' };
    }

    try {
      const createdExchanges: string[] = [];
      const createdQueues: string[] = [];

      // Create exchanges
      for (const [_key, exchange] of Object.entries(EXCHANGES)) {
        this.logger.log(`Creating exchange: ${exchange.name} (${exchange.type})`);
        await this.channel.assertExchange(exchange.name, exchange.type, exchange.options);
        createdExchanges.push(exchange.name);
      }

      // Create queues and bindings
      for (const [_key, queue] of Object.entries(QUEUES)) {
        const queueConfig = queue as any;
        const exchange = queueConfig.exchange || EXCHANGES.CAMPAIGNS.name;
        const queueOptions = this.transformQueueOptions(queueConfig.options);

        this.logger.log(
          `Creating queue: ${queueConfig.name} -> ${exchange}:${queueConfig.routingKey}`
        );
        await this.channel.assertQueue(queueConfig.name, queueOptions);
        await this.channel.bindQueue(queueConfig.name, exchange, queueConfig.routingKey);
        createdQueues.push(queueConfig.name);
      }

      return {
        success: true,
        details: {
          exchanges: createdExchanges,
          queues: createdQueues,
        },
      };
    } catch (error: any) {
      this.logger.error(`Manual setup failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ==================== Generic Publish ====================

  /**
   * Publish a message to an exchange
   */
  async publish(
    exchange: string,
    routingKey: string,
    message: any,
    options?: PublishOptions
  ): Promise<boolean> {
    if (!this.channel || !this.isConnected) {
      this.logger.error('Cannot publish: RabbitMQ not connected');
      return false;
    }

    try {
      const content = Buffer.from(JSON.stringify(message));
      const publishOptions: amqp.Options.Publish = {
        persistent: options?.persistent ?? true,
        priority: options?.priority,
        expiration: options?.expiration,
        headers: options?.headers,
        contentType: 'application/json',
        timestamp: Date.now(),
      };

      // Handle delayed messages if plugin is available
      if (options?.delay && options.delay > 0) {
        publishOptions.headers = {
          ...publishOptions.headers,
          'x-delay': options.delay,
        };
      }

      const result = this.channel.publish(exchange, routingKey, content, publishOptions);

      if (!result) {
        this.logger.warn(`Channel buffer full when publishing to ${exchange}:${routingKey}`);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Error publishing to ${exchange}:${routingKey}: ${error.message}`);
      return false;
    }
  }

  // ==================== Email Operations ====================

  /**
   * Publish email campaign prepare message
   */
  async publishEmailPrepare(message: EmailPrepareMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.EMAIL_PREPARE, message);
  }

  /**
   * Publish single email send message
   */
  async publishEmailSend(message: EmailSendMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.EMAIL_SEND, message);
  }

  /**
   * Publish batch email send message
   */
  async publishEmailBatch(message: EmailBatchMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.EMAIL_BATCH, message);
  }

  /**
   * Publish email retry message
   */
  async publishEmailRetry(message: EmailRetryMessage, delayMs?: number): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.EMAIL_RETRY, message, {
      delay: delayMs,
    });
  }

  /**
   * Publish failed email message (for DLQ analysis)
   */
  async publishEmailFailed(message: EmailRetryMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.EMAIL_FAILED, message);
  }

  // ==================== SMS Operations ====================

  /**
   * Publish SMS campaign prepare message
   */
  async publishSmsPrepare(message: EmailPrepareMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.SMS_PREPARE, message);
  }

  /**
   * Publish single SMS send message
   */
  async publishSmsSend(message: EmailSendMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.SMS_SEND, message);
  }

  // ==================== WhatsApp Operations ====================

  /**
   * Publish WhatsApp campaign prepare message
   */
  async publishWhatsAppPrepare(message: EmailPrepareMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.WHATSAPP_PREPARE, message);
  }

  /**
   * Publish single WhatsApp send message
   */
  async publishWhatsAppSend(message: EmailSendMessage): Promise<boolean> {
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.WHATSAPP_SEND, message);
  }

  // ==================== Tracking Operations ====================

  /**
   * Publish tracking event
   */
  async publishTrackingEvent(message: TrackingEventMessage): Promise<boolean> {
    const routingKey = `tracking.event.${message.type}`;
    return this.publish(EXCHANGES.EVENTS.name, routingKey, message);
  }

  /**
   * Publish bulk tracking update
   */
  async publishTrackingBulk(message: TrackingBulkMessage): Promise<boolean> {
    return this.publish(EXCHANGES.EVENTS.name, ROUTING_KEYS.TRACKING_BULK, message);
  }

  // ==================== Webhook Operations ====================

  /**
   * Publish SES webhook notification
   */
  async publishSESWebhook(message: WebhookSESMessage): Promise<boolean> {
    return this.publish(EXCHANGES.EVENTS.name, ROUTING_KEYS.WEBHOOK_SES, message);
  }

  /**
   * Publish Twilio webhook notification
   */
  async publishTwilioWebhook(message: any): Promise<boolean> {
    return this.publish(EXCHANGES.EVENTS.name, ROUTING_KEYS.WEBHOOK_TWILIO, message);
  }

  // ==================== Campaign Lifecycle ====================

  /**
   * Publish campaign start event
   */
  async publishCampaignStart(campaignId: string, tenantId: string): Promise<boolean> {
    const message: CampaignLifecycleMessage = {
      campaignId,
      tenantId,
      action: 'start',
      timestamp: new Date(),
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.CAMPAIGN_START, message);
  }

  /**
   * Publish campaign pause event
   */
  async publishCampaignPause(campaignId: string, tenantId: string): Promise<boolean> {
    const message: CampaignLifecycleMessage = {
      campaignId,
      tenantId,
      action: 'pause',
      timestamp: new Date(),
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.CAMPAIGN_PAUSE, message);
  }

  /**
   * Publish campaign resume event
   */
  async publishCampaignResume(campaignId: string, tenantId: string): Promise<boolean> {
    const message: CampaignLifecycleMessage = {
      campaignId,
      tenantId,
      action: 'resume',
      timestamp: new Date(),
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.CAMPAIGN_RESUME, message);
  }

  /**
   * Publish campaign cancel event
   */
  async publishCampaignCancel(campaignId: string, tenantId: string): Promise<boolean> {
    const message: CampaignLifecycleMessage = {
      campaignId,
      tenantId,
      action: 'cancel',
      timestamp: new Date(),
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.CAMPAIGN_CANCEL, message);
  }

  /**
   * Publish campaign complete event
   */
  async publishCampaignComplete(campaignId: string, tenantId: string): Promise<boolean> {
    const message: CampaignLifecycleMessage = {
      campaignId,
      tenantId,
      action: 'complete',
      timestamp: new Date(),
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.CAMPAIGN_COMPLETE, message);
  }

  // ==================== Stats Sync ====================

  /**
   * Publish stats sync request
   */
  async publishStatsSync(campaignId: string, tenantId: string): Promise<boolean> {
    const message: StatsSyncMessage = {
      campaignId,
      tenantId,
    };
    return this.publish(EXCHANGES.CAMPAIGNS.name, ROUTING_KEYS.STATS_SYNC, message);
  }

  // ==================== Batch Publishing ====================

  /**
   * Publish multiple messages efficiently
   */
  async publishBatch(
    messages: Array<{
      exchange: string;
      routingKey: string;
      message: any;
      options?: PublishOptions;
    }>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const msg of messages) {
      const result = await this.publish(msg.exchange, msg.routingKey, msg.message, msg.options);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Publish multiple email send messages in batch
   */
  async publishEmailSendBatch(
    messages: EmailSendMessage[]
  ): Promise<{ success: number; failed: number }> {
    return this.publishBatch(
      messages.map((message) => ({
        exchange: EXCHANGES.CAMPAIGNS.name,
        routingKey: ROUTING_KEYS.EMAIL_SEND,
        message,
      }))
    );
  }
}
