import { ServiceUnavailableException } from '@nestjs/common';
import { ClientOfflineError, SimpleError, type RedisClientType } from 'redis';
import { LoginProtectionService } from './login-protection.service';
import { runRedisSecurity, REDIS_SECURITY_TIMEOUT_MS } from './redis-security';

describe('Redis security boundary', () => {
  const redis = {
    isReady: true,
    isOpen: true,
    eval: jest.fn(),
    destroy: jest.fn(),
  };
  let protection: LoginProtectionService;
  beforeEach(() => {
    jest.resetAllMocks();
    redis.isReady = true;
    redis.isOpen = true;
    protection = new LoginProtectionService(
      redis as unknown as RedisClientType,
    );
  });
  afterEach(() => jest.useRealTimers());
  it('uses identical hashed keys for normalized email variants', async () => {
    redis.eval.mockResolvedValue(0);
    await protection.check(' Parent@Example.com ');
    await protection.check('parent@example.com');
    expect(redis.eval.mock.calls[0][1].keys).toEqual(
      redis.eval.mock.calls[1][1].keys,
    );
    expect(JSON.stringify(redis.eval.mock.calls)).not.toContain(
      'parent@example.com',
    );
  });
  it('preserves account retry information', async () => {
    redis.eval.mockResolvedValue(30);
    await expect(
      protection.recordFailure('parent@example.com'),
    ).rejects.toMatchObject({
      response: { statusCode: 429, retryAfterSeconds: 30 },
    });
  });
  it('refuses an unavailable client without submitting commands', async () => {
    redis.isReady = false;
    await expect(protection.check('parent@example.com')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it.each([
    new ClientOfflineError(),
    Object.assign(new Error('private synthetic transport details'), {
      code: 'ECONNRESET',
    }),
    new SimpleError('LOADING synthetic'),
  ])('sanitizes infrastructure failure', async (error) => {
    redis.eval.mockRejectedValue(error);
    await expect(protection.check('parent@example.com')).rejects.toMatchObject({
      response: {
        statusCode: 503,
        message: 'Authentication protection is temporarily unavailable',
      },
    });
  });
  it.each([
    new TypeError('synthetic programming failure'),
    new SimpleError('ERR synthetic Lua failure'),
  ])(
    'does not disguise programming errors as infrastructure failures',
    async (error) => {
      redis.eval.mockRejectedValue(error);
      await expect(protection.check('parent@example.com')).rejects.toBe(error);
    },
  );
  it('bounds a stalled in-flight request and closes its connection', async () => {
    jest.useFakeTimers();
    const work = runRedisSecurity(
      redis as unknown as RedisClientType,
      () => new Promise<never>(() => {}),
    );
    const rejected = expect(work).rejects.toThrow(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(REDIS_SECURITY_TIMEOUT_MS);
    await rejected;
    expect(redis.destroy).toHaveBeenCalledTimes(1);
  });
  it('validates the Redis reply instead of silently treating bad state as success', async () => {
    redis.eval.mockResolvedValue('invalid');
    await expect(
      protection.finalizeSuccess('parent@example.com'),
    ).rejects.toThrow('Invalid login protection result');
  });
});
