import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisCacheService } from './redis-cache.service';
import { RedisCounterService } from './redis-counter.service';

@Global()
@Module({
  providers: [RedisService, RedisCacheService, RedisCounterService],
  exports: [RedisService, RedisCacheService, RedisCounterService],
})
export class RedisModule {}
