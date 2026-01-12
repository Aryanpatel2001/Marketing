/**
 * Redis Configuration Constants
 */

// Redis Key Prefixes
export const REDIS_PREFIXES = {
  // Campaign keys
  CAMPAIGN_STATS: 'campaign:stats:', // campaign:stats:{campaignId}
  CAMPAIGN_LOCK: 'campaign:lock:', // campaign:lock:{campaignId}
  CAMPAIGN_PROGRESS: 'campaign:progress:', // campaign:progress:{campaignId}

  // Tracking keys
  TRACKING_OPENS: 'tracking:opens:', // tracking:opens:{campaignId}
  TRACKING_CLICKS: 'tracking:clicks:', // tracking:clicks:{campaignId}
  TRACKING_PROCESSED: 'tracking:processed:', // tracking:processed:{messageId}

  // Certificate cache (for SNS webhook verification)
  CERT_CACHE: 'cert:cache:', // cert:cache:{url_hash}

  // Idempotency keys
  IDEMPOTENCY: 'idempotency:', // idempotency:{messageId}

  // Rate limiting
  RATE_LIMIT: 'rate:limit:', // rate:limit:{key}

  // SES rate limiting
  SES_RATE: 'ses:rate:',

  // General cache
  CACHE: 'cache:',
} as const;

// Redis TTL Values (in seconds)
export const REDIS_TTL = {
  CAMPAIGN_STATS: 86400, // 24 hours
  CAMPAIGN_LOCK: 300, // 5 minutes
  CAMPAIGN_PROGRESS: 3600, // 1 hour
  TRACKING_PROCESSED: 86400, // 24 hours
  CERT_CACHE: 3600, // 1 hour
  IDEMPOTENCY: 86400, // 24 hours
  RATE_LIMIT: 60, // 1 minute
  SES_RATE: 1, // 1 second
  DEFAULT_CACHE: 300, // 5 minutes
} as const;

// Injection tokens
export const REDIS_CLIENT = 'REDIS_CLIENT';
