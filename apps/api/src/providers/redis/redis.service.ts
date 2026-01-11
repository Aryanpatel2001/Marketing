import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 50, 2000),
        });
      } else {
        this.client = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
          db: redisDb,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 50, 2000),
        });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.logger.error(`Redis error: ${error.message}`);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

      await this.client.connect();
    } catch (error: any) {
      this.logger.warn(`Redis not available: ${error.message}. Running in degraded mode.`);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis disconnected');
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  // ==================== Basic Operations ====================

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error: any) {
      this.logger.error(`Redis GET error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set a value with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error: any) {
      this.logger.error(`Redis SET error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Set value only if it doesn't exist (for locking)
   */
  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlSeconds) {
        const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } else {
        const result = await this.client.setnx(key, value);
        return result === 1;
      }
    } catch (error: any) {
      this.logger.error(`Redis SETNX error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error: any) {
      this.logger.error(`Redis DEL error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  async delMany(keys: string[]): Promise<boolean> {
    if (!this.client || keys.length === 0) return false;
    try {
      await this.client.del(...keys);
      return true;
    } catch (error: any) {
      this.logger.error(`Redis DELMANY error: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error: any) {
      this.logger.error(`Redis EXISTS error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.expire(key, ttlSeconds);
      return true;
    } catch (error: any) {
      this.logger.error(`Redis EXPIRE error for key ${key}: ${error.message}`);
      return false;
    }
  }

  // ==================== Counter Operations ====================

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.incr(key);
    } catch (error: any) {
      this.logger.error(`Redis INCR error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Increment by a specific amount
   */
  async incrBy(key: string, amount: number): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.incrby(key, amount);
    } catch (error: any) {
      this.logger.error(`Redis INCRBY error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decr(key: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.decr(key);
    } catch (error: any) {
      this.logger.error(`Redis DECR error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  // ==================== Hash Operations ====================

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (error: any) {
      this.logger.error(`Redis HGET error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.hset(key, field, value);
      return true;
    } catch (error: any) {
      this.logger.error(`Redis HSET error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Set multiple hash fields
   */
  async hmset(key: string, data: Record<string, string | number>): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.hmset(key, data);
      return true;
    } catch (error: any) {
      this.logger.error(`Redis HMSET error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string> | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.hgetall(key);
      return Object.keys(result).length > 0 ? result : null;
    } catch (error: any) {
      this.logger.error(`Redis HGETALL error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Increment hash field
   */
  async hincrby(key: string, field: string, amount: number): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.hincrby(key, field, amount);
    } catch (error: any) {
      this.logger.error(`Redis HINCRBY error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  // ==================== List Operations ====================

  /**
   * Push to left of list
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.lpush(key, ...values);
    } catch (error: any) {
      this.logger.error(`Redis LPUSH error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Push to right of list
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.rpush(key, ...values);
    } catch (error: any) {
      this.logger.error(`Redis RPUSH error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Pop from left of list with blocking
   */
  async blpop(key: string, timeoutSeconds: number): Promise<string | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.blpop(key, timeoutSeconds);
      return result ? result[1] : null;
    } catch (error: any) {
      this.logger.error(`Redis BLPOP error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get list length
   */
  async llen(key: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.llen(key);
    } catch (error: any) {
      this.logger.error(`Redis LLEN error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get list range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error: any) {
      this.logger.error(`Redis LRANGE error for key ${key}: ${error.message}`);
      return [];
    }
  }

  // ==================== Set Operations ====================

  /**
   * Add member to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.sadd(key, ...members);
    } catch (error: any) {
      this.logger.error(`Redis SADD error for key ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error: any) {
      this.logger.error(`Redis SISMEMBER error for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all set members
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.smembers(key);
    } catch (error: any) {
      this.logger.error(`Redis SMEMBERS error for key ${key}: ${error.message}`);
      return [];
    }
  }

  // ==================== Pub/Sub Operations ====================

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.publish(channel, message);
    } catch (error: any) {
      this.logger.error(`Redis PUBLISH error for channel ${channel}: ${error.message}`);
      return 0;
    }
  }

  // ==================== Utility Operations ====================

  /**
   * Find keys by pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.keys(pattern);
    } catch (error: any) {
      this.logger.error(`Redis KEYS error for pattern ${pattern}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) return -2;
    try {
      return await this.client.ttl(key);
    } catch (error: any) {
      this.logger.error(`Redis TTL error for key ${key}: ${error.message}`);
      return -2;
    }
  }

  /**
   * Execute multiple commands in a pipeline
   */
  async pipeline(commands: Array<[string, ...any[]]>): Promise<any[]> {
    if (!this.client) return [];
    try {
      const pipeline = this.client.pipeline();
      for (const [cmd, ...args] of commands) {
        (pipeline as any)[cmd](...args);
      }
      const results = await pipeline.exec();
      return results?.map(([err, result]) => (err ? null : result)) || [];
    } catch (error: any) {
      this.logger.error(`Redis PIPELINE error: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute a transaction
   */
  async multi(commands: Array<[string, ...any[]]>): Promise<any[]> {
    if (!this.client) return [];
    try {
      const multi = this.client.multi();
      for (const [cmd, ...args] of commands) {
        (multi as any)[cmd](...args);
      }
      const results = await multi.exec();
      return results?.map(([err, result]) => (err ? null : result)) || [];
    } catch (error: any) {
      this.logger.error(`Redis MULTI error: ${error.message}`);
      return [];
    }
  }
}
