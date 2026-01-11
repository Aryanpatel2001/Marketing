import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { REDIS_PREFIXES, REDIS_TTL } from './redis.constants';

export interface CampaignStats {
  sent: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
}

@Injectable()
export class RedisCounterService {
  private readonly logger = new Logger(RedisCounterService.name);

  constructor(private readonly redis: RedisService) {}

  // ==================== Campaign Stats ====================

  /**
   * Initialize campaign stats in Redis
   */
  async initCampaignStats(campaignId: string): Promise<void> {
    const key = `${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`;
    await this.redis.hmset(key, {
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      bounced: 0,
      complained: 0,
    });
    await this.redis.expire(key, REDIS_TTL.CAMPAIGN_STATS);
  }

  /**
   * Increment sent count
   */
  async incrSent(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`, 'sent', amount);
  }

  /**
   * Increment failed count
   */
  async incrFailed(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`, 'failed', amount);
  }

  /**
   * Increment opened count
   */
  async incrOpened(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`, 'opened', amount);
  }

  /**
   * Increment clicked count
   */
  async incrClicked(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`, 'clicked', amount);
  }

  /**
   * Increment unsubscribed count
   */
  async incrUnsubscribed(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(
      `${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`,
      'unsubscribed',
      amount
    );
  }

  /**
   * Increment bounced count
   */
  async incrBounced(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`, 'bounced', amount);
  }

  /**
   * Increment complained count
   */
  async incrComplained(campaignId: string, amount = 1): Promise<number> {
    return this.redis.hincrby(
      `${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`,
      'complained',
      amount
    );
  }

  /**
   * Get all campaign stats
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const data = await this.redis.hgetall(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`);
    if (!data) return null;

    return {
      sent: parseInt(data.sent || '0', 10),
      failed: parseInt(data.failed || '0', 10),
      opened: parseInt(data.opened || '0', 10),
      clicked: parseInt(data.clicked || '0', 10),
      unsubscribed: parseInt(data.unsubscribed || '0', 10),
      bounced: parseInt(data.bounced || '0', 10),
      complained: parseInt(data.complained || '0', 10),
    };
  }

  /**
   * Delete campaign stats from Redis
   */
  async deleteCampaignStats(campaignId: string): Promise<boolean> {
    return this.redis.del(`${REDIS_PREFIXES.CAMPAIGN_STATS}${campaignId}`);
  }

  // ==================== Tracking Deduplication ====================

  /**
   * Check if an open has already been tracked for a message
   */
  async hasTrackedOpen(messageId: string): Promise<boolean> {
    return this.redis.sismember(`${REDIS_PREFIXES.TRACKING_OPENS}opened`, messageId);
  }

  /**
   * Mark an open as tracked
   */
  async markOpenTracked(campaignId: string, messageId: string): Promise<boolean> {
    // Use a set to track unique opens per campaign
    await this.redis.sadd(`${REDIS_PREFIXES.TRACKING_OPENS}${campaignId}`, messageId);
    // Also track globally
    const result = await this.redis.sadd(`${REDIS_PREFIXES.TRACKING_OPENS}opened`, messageId);
    // Expire keys after 24 hours
    await this.redis.expire(
      `${REDIS_PREFIXES.TRACKING_OPENS}${campaignId}`,
      REDIS_TTL.TRACKING_PROCESSED
    );
    await this.redis.expire(`${REDIS_PREFIXES.TRACKING_OPENS}opened`, REDIS_TTL.TRACKING_PROCESSED);
    return result > 0;
  }

  /**
   * Check if a click has already been tracked for a message/url combo
   */
  async hasTrackedClick(messageId: string, urlIndex: number): Promise<boolean> {
    const key = `${messageId}:${urlIndex}`;
    return this.redis.sismember(`${REDIS_PREFIXES.TRACKING_CLICKS}clicked`, key);
  }

  /**
   * Mark a click as tracked
   */
  async markClickTracked(
    campaignId: string,
    messageId: string,
    urlIndex: number
  ): Promise<boolean> {
    const key = `${messageId}:${urlIndex}`;
    await this.redis.sadd(`${REDIS_PREFIXES.TRACKING_CLICKS}${campaignId}`, key);
    const result = await this.redis.sadd(`${REDIS_PREFIXES.TRACKING_CLICKS}clicked`, key);
    await this.redis.expire(
      `${REDIS_PREFIXES.TRACKING_CLICKS}${campaignId}`,
      REDIS_TTL.TRACKING_PROCESSED
    );
    await this.redis.expire(
      `${REDIS_PREFIXES.TRACKING_CLICKS}clicked`,
      REDIS_TTL.TRACKING_PROCESSED
    );
    return result > 0;
  }

  /**
   * Get unique open count for a campaign
   */
  async getUniqueOpenCount(campaignId: string): Promise<number> {
    const members = await this.redis.smembers(`${REDIS_PREFIXES.TRACKING_OPENS}${campaignId}`);
    return members.length;
  }

  /**
   * Get unique click count for a campaign
   */
  async getUniqueClickCount(campaignId: string): Promise<number> {
    const members = await this.redis.smembers(`${REDIS_PREFIXES.TRACKING_CLICKS}${campaignId}`);
    // Count unique messageIds (strip urlIndex)
    const uniqueMessages = new Set(members.map((m) => m.split(':')[0]));
    return uniqueMessages.size;
  }

  // ==================== Rate Limiting ====================

  /**
   * Check and increment rate limit counter
   * Returns true if within limit, false if exceeded
   */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const fullKey = `${REDIS_PREFIXES.RATE_LIMIT}${key}`;
    const current = await this.redis.incr(fullKey);

    if (current === 1) {
      // First request, set expiry
      await this.redis.expire(fullKey, windowSeconds);
    }

    return current <= limit;
  }

  /**
   * Get current rate limit count
   */
  async getRateLimitCount(key: string): Promise<number> {
    const value = await this.redis.get(`${REDIS_PREFIXES.RATE_LIMIT}${key}`);
    return value ? parseInt(value, 10) : 0;
  }

  // ==================== SES Rate Limiting ====================

  /**
   * Track SES send rate (per second)
   * AWS SES has a sending rate limit (e.g., 14 emails/second)
   */
  async checkSESRateLimit(limit: number): Promise<boolean> {
    const key = `${REDIS_PREFIXES.SES_RATE}${Math.floor(Date.now() / 1000)}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, REDIS_TTL.SES_RATE);
    }

    return current <= limit;
  }

  /**
   * Get current SES rate
   */
  async getCurrentSESRate(): Promise<number> {
    const key = `${REDIS_PREFIXES.SES_RATE}${Math.floor(Date.now() / 1000)}`;
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  // ==================== Distributed Locking ====================

  /**
   * Acquire a distributed lock
   */
  async acquireLock(lockName: string, ttlSeconds = 300): Promise<boolean> {
    const lockKey = `${REDIS_PREFIXES.CAMPAIGN_LOCK}${lockName}`;
    const lockValue = `${Date.now()}:${Math.random().toString(36).substring(2)}`;
    return this.redis.setNX(lockKey, lockValue, ttlSeconds);
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockName: string): Promise<boolean> {
    return this.redis.del(`${REDIS_PREFIXES.CAMPAIGN_LOCK}${lockName}`);
  }

  /**
   * Check if lock exists
   */
  async isLocked(lockName: string): Promise<boolean> {
    return this.redis.exists(`${REDIS_PREFIXES.CAMPAIGN_LOCK}${lockName}`);
  }

  /**
   * Extend lock TTL
   */
  async extendLock(lockName: string, ttlSeconds: number): Promise<boolean> {
    return this.redis.expire(`${REDIS_PREFIXES.CAMPAIGN_LOCK}${lockName}`, ttlSeconds);
  }
}
