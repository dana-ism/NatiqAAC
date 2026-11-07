import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { LoginProtectionService } from '../src/auth/login-protection.service';
import { AuthRateLimitStorage } from '../src/auth/auth-rate-limit.storage';
import { isolatedTestEnvironment } from './test-environment';

const settings = isolatedTestEnvironment(process.env);
const redis = createClient({
  url: settings.redisUrl,
  socket: { connectTimeout: 3000, reconnectStrategy: false },
  disableOfflineQueue: true,
});
const protection = new LoginProtectionService(redis);
const owned = new Set<string>();
function identity() {
  const email = randomUUID() + '@example.com';
  const prefix =
    'auth:login:' + createHash('sha256').update(email).digest('hex');
  const keys = {
    failures: prefix + ':failures',
    stage: prefix + ':stage',
    lock: prefix + ':lock',
  };
  Object.values(keys).forEach((key) => owned.add(key));
  return { email, keys };
}
async function failFour(email: string) {
  for (let i = 0; i < 4; i++) await protection.recordFailure(email);
}

describe('Real isolated Redis login protection', () => {
  beforeAll(async () => {
    redis.on('error', () => {});
    await redis.connect();
  });
  afterEach(async () => {
    if (redis.isReady && owned.size) await redis.del([...owned]);
    owned.clear();
  });
  afterAll(() => {
    if (redis.isOpen) redis.destroy();
  });

  it('locks on the fifth failure and does not extend a live lock', async () => {
    const { email, keys } = identity();
    await failFour(email);
    expect(await redis.exists(keys.lock)).toBe(0);
    await expect(protection.recordFailure(email)).rejects.toMatchObject({
      status: 429,
      response: { retryAfterSeconds: 30 },
    });
    const ttl = await redis.pTTL(keys.lock),
      stageTtl = await redis.pTTL(keys.stage);
    await expect(protection.check(email)).rejects.toMatchObject({
      status: 429,
    });
    await expect(protection.recordFailure(email)).rejects.toMatchObject({
      status: 429,
    });
    expect(await redis.pTTL(keys.lock)).toBeLessThanOrEqual(ttl);
    expect(await redis.pTTL(keys.stage)).toBeLessThanOrEqual(stageTtl);
    expect(stageTtl).toBeGreaterThan(1820000);
    expect(stageTtl).toBeLessThanOrEqual(1830000);
  });
  it('requires five new failures per escalation and caps at 900 seconds', async () => {
    const { email, keys } = identity();
    for (const [index, duration] of [
      30, 60, 120, 240, 480, 900, 900,
    ].entries()) {
      if (index > 0) {
        await redis.pExpire(keys.lock, 1);
        await delay(15);
      }
      await failFour(email);
      expect(await redis.exists(keys.lock)).toBe(0);
      await expect(protection.recordFailure(email)).rejects.toMatchObject({
        response: { retryAfterSeconds: duration },
      });
      expect(await redis.get(keys.stage)).toBe(String(Math.min(index + 1, 6)));
      const ttl = await redis.pTTL(keys.stage);
      expect(ttl).toBeGreaterThan((duration + 1800) * 1000 - 10000);
      expect(ttl).toBeLessThanOrEqual((duration + 1800) * 1000);
    }
  });
  it('expires a counting window without accumulating old failures', async () => {
    const { email, keys } = identity();
    await failFour(email);
    expect(await redis.pTTL(keys.failures)).toBeGreaterThan(50000);
    await redis.pExpire(keys.failures, 1);
    await delay(15);
    await protection.recordFailure(email);
    expect(await redis.get(keys.failures)).toBe('1');
    expect(await redis.exists(keys.lock)).toBe(0);
  });
  it('recovers after stage expiration (accelerated expiry of test-owned keys)', async () => {
    const { email, keys } = identity();
    await redis.set(keys.stage, '6', { PX: 10 });
    await delay(25);
    await failFour(email);
    await expect(protection.recordFailure(email)).rejects.toMatchObject({
      response: { retryAfterSeconds: 30 },
    });
  });
  it('bounds legacy stages once and preserves the existing lock', async () => {
    const { email, keys } = identity();
    await redis.set(keys.stage, '12');
    await redis.set(keys.lock, '1', { PX: 30000 });
    await expect(protection.check(email)).rejects.toMatchObject({
      status: 429,
    });
    const ttl = await redis.pTTL(keys.stage);
    expect(ttl).toBeGreaterThan(1820000);
    expect(await redis.get(keys.stage)).toBe('12');
    await expect(protection.check(email)).rejects.toMatchObject({
      status: 429,
    });
    expect(await redis.pTTL(keys.stage)).toBeLessThanOrEqual(ttl);
  });
  it('resets an unlocked account on successful authorization', async () => {
    const { email, keys } = identity();
    await redis.set(keys.stage, '2', { PX: 1800000 });
    await failFour(email);
    await protection.finalizeSuccess(email);
    expect(await redis.exists(Object.values(keys))).toBe(0);
  });
  it('serializes concurrent failures into exactly one initial lock', async () => {
    const { email, keys } = identity();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => protection.recordFailure(email)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(4);
    expect(await redis.get(keys.stage)).toBe('1');
    expect(await redis.exists(keys.failures)).toBe(0);
  });
  it('does not clear a concurrent lock created before success finalization', async () => {
    const { email, keys } = identity();
    await protection.check(email);
    await failFour(email);
    const results = await Promise.allSettled([
      protection.recordFailure(email),
      protection.finalizeSuccess(email),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(await redis.exists(keys.lock)).toBe(1);
  });
  it('counts a failure serialized after successful reset as a new attempt', async () => {
    const { email, keys } = identity();
    await failFour(email);
    await Promise.all([
      protection.finalizeSuccess(email),
      protection.recordFailure(email),
    ]);
    expect(await redis.get(keys.failures)).toBe('1');
    expect(await redis.exists(keys.lock)).toBe(0);
  });
  it('checks the near-expiry lock rather than interpreting TTL=0 as absent', async () => {
    const { email, keys } = identity();
    await redis.set(keys.lock, '1', { PX: 400 });
    await expect(protection.finalizeSuccess(email)).rejects.toMatchObject({
      status: 429,
    });
    expect(await redis.exists(keys.lock)).toBe(1);
  });
  it('uses real Redis throttling for both approved limits', async () => {
    const storage = new AuthRateLimitStorage(redis);
    for (const limit of [5, 20]) {
      const key = randomUUID(),
        stored = '_throttler:{' + key + '}:default';
      owned.add(stored);
      owned.add(stored + ':block');
      for (let i = 0; i < limit; i++)
        expect(
          (await storage.increment(key, 60000, limit, 60000, 'default'))
            .isBlocked,
        ).toBe(false);
      const blocked = await storage.increment(
        key,
        60000,
        limit,
        60000,
        'default',
      );
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    }
  });
  it('fails closed for both security boundaries when a real client is disconnected', async () => {
    const disconnected = createClient({ url: settings.redisUrl });
    await expect(
      new LoginProtectionService(disconnected).check('synthetic@example.com'),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      new AuthRateLimitStorage(disconnected).increment(
        randomUUID(),
        60000,
        5,
        60000,
        'default',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
