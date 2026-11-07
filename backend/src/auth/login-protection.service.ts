import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RedisToken } from '@nestjs-redis/client';
import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import { normalizeEmail } from './normalize-email';
import { runRedisSecurity } from './redis-security';

// All state transitions (including successful authorization) serialize in Redis.
const LOGIN_SCRIPT = `
local operation = ARGV[1]
local lockTtl = redis.call('PTTL', KEYS[3])
if lockTtl == -1 then return redis.error_reply('AUTH invalid persistent lock') end
local stage = tonumber(redis.call('GET', KEYS[2]) or '0')
if not stage or stage < 0 then return redis.error_reply('AUTH invalid stage') end
-- Bound legacy stages without deleting or shortening an existing lock.
if redis.call('PTTL', KEYS[2]) == -1 then
  redis.call('PEXPIRE', KEYS[2], math.max(lockTtl, 0) + 1800000)
end
if lockTtl >= 0 then return math.max(1, math.ceil(lockTtl / 1000)) end
if operation == 'check' then return 0 end
if operation == 'success' then
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return 0
end
if operation ~= 'failure' then return redis.error_reply('AUTH invalid operation') end
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
if attempts < 5 then return 0 end
local nextStage = math.min(stage + 1, 6)
local durations = {30, 60, 120, 240, 480, 900}
local duration = durations[nextStage]
redis.call('SET', KEYS[2], tostring(nextStage), 'PX', (duration + 1800) * 1000)
redis.call('SET', KEYS[3], '1', 'PX', duration * 1000)
redis.call('DEL', KEYS[1])
return duration
`;

@Injectable()
export class LoginProtectionService {
  constructor(@Inject(RedisToken()) private readonly redis: RedisClientType) {}

  check(email: string) {
    return this.transition(email, 'check');
  }
  recordFailure(email: string) {
    return this.transition(email, 'failure');
  }
  finalizeSuccess(email: string) {
    return this.transition(email, 'success');
  }

  private async transition(
    email: string,
    operation: 'check' | 'failure' | 'success',
  ): Promise<void> {
    const digest = createHash('sha256')
      .update(normalizeEmail(email))
      .digest('hex');
    const prefix = 'auth:login:' + digest;
    const result = await runRedisSecurity(this.redis, () =>
      this.redis.eval(LOGIN_SCRIPT, {
        keys: [prefix + ':failures', prefix + ':stage', prefix + ':lock'],
        arguments: [operation],
      }),
    );
    if (typeof result !== 'number' || !Number.isFinite(result) || result < 0) {
      throw new Error('Invalid login protection result');
    }
    if (result > 0)
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Too many failed login attempts. Try again in ' +
            result +
            ' seconds.',
          retryAfterSeconds: result,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
