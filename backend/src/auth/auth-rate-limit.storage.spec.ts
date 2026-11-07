import { ServiceUnavailableException } from '@nestjs/common';
import { ClientClosedError, type RedisClientType } from 'redis';
import { AuthRateLimitStorage } from './auth-rate-limit.storage';
import {
  connectRedisSecurity,
  REDIS_SECURITY_TIMEOUT_MS,
} from './redis-security';

describe('Redis-backed throttling and startup failures', () => {
  const client = {
    isReady: true,
    isOpen: true,
    scriptLoad: jest.fn(),
    evalSha: jest.fn(),
    connect: jest.fn(),
    destroy: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    client.isReady = true;
    client.isOpen = true;
    client.scriptLoad.mockResolvedValue('a'.repeat(40));
    client.evalSha.mockResolvedValue([1, 60000, -1, 0]);
  });
  afterEach(() => jest.useRealTimers());
  const storage = () =>
    new AuthRateLimitStorage(client as unknown as RedisClientType);
  it('preserves successful throttling records', async () => {
    await expect(
      storage().increment('synthetic', 60000, 5, 60000, 'default'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });
  it('handles script loading infrastructure failures before AuthService', async () => {
    client.scriptLoad.mockRejectedValue(new ClientClosedError());
    await expect(
      storage().increment('synthetic', 60000, 5, 60000, 'default'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
  it('handles a transport failure during increment', async () => {
    client.evalSha.mockRejectedValue(
      Object.assign(new Error('synthetic private details'), {
        code: 'ECONNRESET',
      }),
    );
    await expect(
      storage().increment('synthetic', 60000, 5, 60000, 'default'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
  it('does not convert a storage programming error to 503', async () => {
    const error = new TypeError('synthetic programming error');
    client.evalSha.mockRejectedValue(error);
    await expect(
      storage().increment('synthetic', 60000, 5, 60000, 'default'),
    ).rejects.toBe(error);
  });
  it('bounds initial Redis handshake as well as TCP establishment', async () => {
    jest.useFakeTimers();
    client.isReady = false;
    client.connect.mockReturnValue(new Promise<never>(() => {}));
    const work = expect(
      connectRedisSecurity(client as unknown as RedisClientType),
    ).rejects.toThrow(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(REDIS_SECURITY_TIMEOUT_MS);
    await work;
    expect(client.destroy).toHaveBeenCalled();
  });
  it('bounds a stalled throttling operation', async () => {
    jest.useFakeTimers();
    client.evalSha.mockReturnValue(new Promise<never>(() => {}));
    const work = expect(
      storage().increment('synthetic', 60000, 5, 60000, 'default'),
    ).rejects.toThrow(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(REDIS_SECURITY_TIMEOUT_MS);
    await work;
    expect(client.destroy).toHaveBeenCalled();
  });
});
