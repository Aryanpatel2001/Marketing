import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { REDIS_PREFIXES, REDIS_TTL } from './redis.constants';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Get cached value with automatic JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(`${REDIS_PREFIXES.CACHE}${key}`);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set cached value with automatic JSON serialization
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return this.redis.set(
      `${REDIS_PREFIXES.CACHE}${key}`,
      serialized,
      ttlSeconds ?? REDIS_TTL.DEFAULT_CACHE
    );
  }

  /**
   * Delete cached value
   */
  async del(key: string): Promise<boolean> {
    return this.redis.del(`${REDIS_PREFIXES.CACHE}${key}`);
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Cache certificate for SNS webhook verification
   */
  async getCertificate(urlHash: string): Promise<string | null> {
    return this.redis.get(`${REDIS_PREFIXES.CERT_CACHE}${urlHash}`);
  }

  /**
   * Store certificate for SNS webhook verification
   */
  async setCertificate(urlHash: string, cert: string): Promise<boolean> {
    return this.redis.set(`${REDIS_PREFIXES.CERT_CACHE}${urlHash}`, cert, REDIS_TTL.CERT_CACHE);
  }

  /**
   * Check idempotency (for webhook deduplication)
   */
  async checkIdempotency(messageId: string): Promise<boolean> {
    const exists = await this.redis.exists(`${REDIS_PREFIXES.IDEMPOTENCY}${messageId}`);
    return exists;
  }

  /**
   * Mark message as processed (for idempotency)
   */
  async markProcessed(messageId: string): Promise<boolean> {
    return this.redis.set(`${REDIS_PREFIXES.IDEMPOTENCY}${messageId}`, '1', REDIS_TTL.IDEMPOTENCY);
  }

  /**
   * Get campaign progress from cache
   */
  async getCampaignProgress(campaignId: string): Promise<{
    sent: number;
    failed: number;
    total: number;
    status: string;
  } | null> {
    const data = await this.redis.hgetall(`${REDIS_PREFIXES.CAMPAIGN_PROGRESS}${campaignId}`);
    if (!data) return null;

    return {
      sent: parseInt(data.sent || '0', 10),
      failed: parseInt(data.failed || '0', 10),
      total: parseInt(data.total || '0', 10),
      status: data.status || 'unknown',
    };
  }

  /**
   * Set campaign progress in cache
   */
  async setCampaignProgress(
    campaignId: string,
    data: {
      sent?: number;
      failed?: number;
      total?: number;
      status?: string;
    }
  ): Promise<boolean> {
    const key = `${REDIS_PREFIXES.CAMPAIGN_PROGRESS}${campaignId}`;
    const hashData: Record<string, string | number> = {};

    if (data.sent !== undefined) hashData.sent = data.sent;
    if (data.failed !== undefined) hashData.failed = data.failed;
    if (data.total !== undefined) hashData.total = data.total;
    if (data.status !== undefined) hashData.status = data.status;

    const result = await this.redis.hmset(key, hashData);
    if (result) {
      await this.redis.expire(key, REDIS_TTL.CAMPAIGN_PROGRESS);
    }
    return result;
  }

  /**
   * Invalidate all cache keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(`${REDIS_PREFIXES.CACHE}${pattern}`);
    if (keys.length === 0) return 0;

    await this.redis.delMany(keys);
    return keys.length;
  }
}
