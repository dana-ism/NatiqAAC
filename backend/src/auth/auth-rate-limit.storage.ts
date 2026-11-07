import { RedisThrottlerStorage } from '@nestjs-redis/throttler-storage';
import type { RedisClientType } from 'redis';
import { runRedisSecurity } from './redis-security';

export class AuthRateLimitStorage extends RedisThrottlerStorage {
  constructor(private readonly securityClient: RedisClientType) {
    super(securityClient);
  }

  override increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ) {
    return runRedisSecurity(this.securityClient, () =>
      super.increment(key, ttl, limit, blockDuration, name),
    );
  }
}
