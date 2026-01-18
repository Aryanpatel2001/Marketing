/**
 * RabbitMQ Queue Configuration Constants
 * Using Topic Exchange for flexible routing patterns
 */

// Exchange definitions
export const EXCHANGES = {
  // Main campaign exchange (Topic type for flexible routing)
  CAMPAIGNS: {
    name: 'campaigns',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
  // Dead Letter Exchange for failed messages
  CAMPAIGNS_DLX: {
    name: 'campaigns.dlx',
    type: 'direct',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
  // Events exchange for tracking events
  EVENTS: {
    name: 'events',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
} as const;

// Routing keys for Topic Exchange
export const ROUTING_KEYS = {
  // Email campaign routing keys
  EMAIL_PREPARE: 'email.campaign.prepare', // Prepare recipients for sending
  EMAIL_SEND: 'email.message.send', // Send individual email
  EMAIL_BATCH: 'email.message.batch', // Send batch of emails
  EMAIL_RETRY: 'email.message.retry', // Retry failed email
  EMAIL_FAILED: 'email.message.failed', // Failed email (after all retries)

  // SMS campaign routing keys
  SMS_PREPARE: 'sms.campaign.prepare',
  SMS_SEND: 'sms.message.send',
  SMS_BATCH: 'sms.message.batch',
  SMS_RETRY: 'sms.message.retry',
  SMS_FAILED: 'sms.message.failed',

  // WhatsApp campaign routing keys
  WHATSAPP_PREPARE: 'whatsapp.campaign.prepare',
  WHATSAPP_SEND: 'whatsapp.message.send',
  WHATSAPP_BATCH: 'whatsapp.message.batch',
  WHATSAPP_RETRY: 'whatsapp.message.retry',
  WHATSAPP_FAILED: 'whatsapp.message.failed',

  // Tracking events
  TRACKING_OPEN: 'tracking.event.open',
  TRACKING_CLICK: 'tracking.event.click',
  TRACKING_UNSUBSCRIBE: 'tracking.event.unsubscribe',
  TRACKING_BOUNCE: 'tracking.event.bounce',
  TRACKING_COMPLAINT: 'tracking.event.complaint',
  TRACKING_BULK: 'tracking.event.bulk', // Bulk tracking update

  // Webhook events
  WEBHOOK_SES: 'webhook.ses.notification',
  WEBHOOK_TWILIO: 'webhook.twilio.notification',
  WEBHOOK_TWILIO_INBOUND: 'webhook.twilio.inbound',

  // Campaign lifecycle
  CAMPAIGN_START: 'campaign.lifecycle.start',
  CAMPAIGN_PAUSE: 'campaign.lifecycle.pause',
  CAMPAIGN_RESUME: 'campaign.lifecycle.resume',
  CAMPAIGN_CANCEL: 'campaign.lifecycle.cancel',
  CAMPAIGN_COMPLETE: 'campaign.lifecycle.complete',

  // Stats sync
  STATS_SYNC: 'stats.sync.campaign',
} as const;

// Queue definitions with bindings
export const QUEUES = {
  // Email queues
  EMAIL_PREPARE: {
    name: 'email.prepare.queue',
    routingKey: 'email.campaign.prepare',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'email.prepare.dlq',
      messageTtl: 86400000, // 24 hours
      maxLength: 10000,
    },
  },
  EMAIL_SEND: {
    name: 'email.send.queue',
    routingKey: 'email.message.*', // Matches send, batch
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'email.send.dlq',
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },
  EMAIL_RETRY: {
    name: 'email.retry.queue',
    routingKey: 'email.message.retry',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'email.retry.dlq',
      messageTtl: 3600000, // 1 hour
      maxLength: 50000,
    },
  },

  // SMS queues
  SMS_PREPARE: {
    name: 'sms.prepare.queue',
    routingKey: 'sms.campaign.prepare',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'sms.prepare.dlq',
      messageTtl: 86400000,
      maxLength: 10000,
    },
  },
  SMS_SEND: {
    name: 'sms.send.queue',
    routingKey: 'sms.message.*',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'sms.send.dlq',
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },
  SMS_RETRY: {
    name: 'sms.retry.queue',
    routingKey: 'sms.message.retry',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'sms.retry.dlq',
      messageTtl: 3600000,
      maxLength: 50000,
    },
  },

  // WhatsApp queues
  WHATSAPP_PREPARE: {
    name: 'whatsapp.prepare.queue',
    routingKey: 'whatsapp.campaign.prepare',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'whatsapp.prepare.dlq',
      messageTtl: 86400000,
      maxLength: 10000,
    },
  },
  WHATSAPP_SEND: {
    name: 'whatsapp.send.queue',
    routingKey: 'whatsapp.message.*',
    options: {
      durable: true,
      deadLetterExchange: EXCHANGES.CAMPAIGNS_DLX.name,
      deadLetterRoutingKey: 'whatsapp.send.dlq',
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },

  // Tracking queues (bind to EVENTS exchange)
  TRACKING_EVENTS: {
    name: 'tracking.events.queue',
    routingKey: 'tracking.event.*', // Matches all tracking events
    exchange: 'events',
    options: {
      durable: true,
      messageTtl: 3600000, // 1 hour
      maxLength: 500000,
    },
  },
  TRACKING_BULK: {
    name: 'tracking.bulk.queue',
    routingKey: 'tracking.event.bulk',
    exchange: 'events',
    options: {
      durable: true,
      messageTtl: 3600000,
      maxLength: 10000,
    },
  },

  // Webhook processing queues (bind to EVENTS exchange)
  WEBHOOK_SES: {
    name: 'webhook.ses.queue',
    routingKey: 'webhook.ses.*',
    exchange: 'events',
    options: {
      durable: true,
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },
  WEBHOOK_TWILIO: {
    name: 'webhook.twilio.queue',
    routingKey: 'webhook.twilio.notification',
    exchange: 'events',
    options: {
      durable: true,
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },
  WEBHOOK_TWILIO_INBOUND: {
    name: 'webhook.twilio.inbound.queue',
    routingKey: 'webhook.twilio.inbound',
    exchange: 'events',
    options: {
      durable: true,
      messageTtl: 86400000,
      maxLength: 100000,
    },
  },

  // Campaign lifecycle queue
  CAMPAIGN_LIFECYCLE: {
    name: 'campaign.lifecycle.queue',
    routingKey: 'campaign.lifecycle.*',
    options: {
      durable: true,
      messageTtl: 86400000,
      maxLength: 10000,
    },
  },

  // Stats sync queue
  STATS_SYNC: {
    name: 'stats.sync.queue',
    routingKey: 'stats.sync.*',
    options: {
      durable: true,
      messageTtl: 300000, // 5 minutes
      maxLength: 10000,
    },
  },

  // Dead Letter Queues
  DLQ_EMAIL: {
    name: 'email.dlq',
    routingKey: 'email.*.dlq',
    exchange: EXCHANGES.CAMPAIGNS_DLX.name,
    options: {
      durable: true,
      messageTtl: 604800000, // 7 days
    },
  },
  DLQ_SMS: {
    name: 'sms.dlq',
    routingKey: 'sms.*.dlq',
    exchange: EXCHANGES.CAMPAIGNS_DLX.name,
    options: {
      durable: true,
      messageTtl: 604800000,
    },
  },
  DLQ_WHATSAPP: {
    name: 'whatsapp.dlq',
    routingKey: 'whatsapp.*.dlq',
    exchange: EXCHANGES.CAMPAIGNS_DLX.name,
    options: {
      durable: true,
      messageTtl: 604800000,
    },
  },
} as const;

// Message types for type safety
export interface EmailPrepareMessage {
  campaignId: string;
  tenantId: string;
  batchSize?: number;
  isDryRun?: boolean; // If true, prepares messages but doesn't send them
}

export interface EmailSendMessage {
  campaignId: string;
  tenantId: string;
  messageId: string;
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, any>;
  attempt?: number;
}

export interface EmailBatchMessage {
  campaignId: string;
  tenantId: string;
  messages: Array<{
    messageId: string;
    contactId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    customFields?: Record<string, any>;
  }>;
}

export interface EmailRetryMessage extends EmailSendMessage {
  attempt: number;
  lastError?: string;
  nextRetryAt?: Date;
}

// SMS Message Types
export interface SmsPrepareMessage {
  campaignId: string;
  tenantId: string;
  batchSize?: number;
  isDryRun?: boolean;
}

export interface SmsSendMessage {
  campaignId: string;
  tenantId: string;
  messageId: string;
  contactId: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, any>;
  attempt?: number;
}

export interface SmsBatchMessage {
  campaignId: string;
  tenantId: string;
  messages: Array<{
    messageId: string;
    contactId: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    customFields?: Record<string, any>;
  }>;
}

export interface SmsRetryMessage extends SmsSendMessage {
  attempt: number;
  lastError?: string;
  nextRetryAt?: Date;
}

export interface TrackingEventMessage {
  type: 'open' | 'click' | 'unsubscribe' | 'bounce' | 'complaint';
  messageId: string;
  campaignId: string;
  contactId: string;
  tenantId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TrackingBulkMessage {
  campaignId: string;
  events: TrackingEventMessage[];
}

export interface WebhookSESMessage {
  notificationType: 'Bounce' | 'Complaint' | 'Delivery';
  messageId: string;
  timestamp: Date;
  payload: Record<string, any>;
}

export interface WebhookTwilioMessage {
  messageSid: string;
  messageStatus: string;
  errorCode?: string;
  errorMessage?: string;
  from?: string;
  to?: string;
  timestamp: Date;
  tenantId?: string; // Optional because legacy or untagged might not have it
  campaignId?: string;
  payload: Record<string, any>;
}

export interface InboundSmsMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia?: number;
  mediaUrls?: string[];
  timestamp: Date;
  tenantId?: string;
  payload: Record<string, any>;
}

export interface CampaignLifecycleMessage {
  campaignId: string;
  tenantId: string;
  action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete';
  timestamp: Date;
}

export interface StatsSyncMessage {
  campaignId: string;
  tenantId: string;
}

// Retry configuration
export const RETRY_CONFIG = {
  EMAIL: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
  SMS: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
  WHATSAPP: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
} as const;

// Worker configuration
export const WORKER_CONFIG = {
  EMAIL_SEND: {
    prefetch: 50, // Process 50 messages at a time
    concurrency: 10, // 10 parallel workers
  },
  SMS_SEND: {
    prefetch: 20,
    concurrency: 10,
  },
  WHATSAPP_SEND: {
    prefetch: 10,
    concurrency: 5,
  },
  TRACKING: {
    prefetch: 100,
    concurrency: 3,
  },
} as const;
