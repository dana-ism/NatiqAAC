import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisToken } from '@nestjs-redis/client';
import { createClient, type RedisClientType } from 'redis';
import { connectRedisSecurity, redisSecurityOptions } from './redis-security';

// Own this security-critical connection so startup, commands and logs are bounded.
@Global()
@Module({
  providers: [
    {
      provide: RedisToken(),
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redis = createClient({
          ...redisSecurityOptions,
          url: config.getOrThrow<string>('REDIS_URL'),
        });
        const logger = new Logger('AuthRedis');
        redis.on('error', () =>
          logger.warn('Authentication Redis connection unavailable'),
        );
        await connectRedisSecurity(redis);
        return redis;
      },
    },
  ],
  exports: [RedisToken()],
})
export class AuthRedisModule implements OnApplicationShutdown {
  constructor(@Inject(RedisToken()) private readonly redis: RedisClientType) {}
  onApplicationShutdown(): void {
    if (this.redis.isOpen) this.redis.destroy();
  }
}
