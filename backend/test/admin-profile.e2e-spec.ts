import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisToken } from '@nestjs-redis/client';
import type { RedisClientType } from 'redis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthRateLimitStorage } from '../src/auth/auth-rate-limit.storage';
import { configureApp } from '../src/configure-app';
import { isolatedTestEnvironment } from './test-environment';

isolatedTestEnvironment(process.env);
describe('Admin profile persistence on isolated PostgreSQL and Redis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisClientType;
  let jwt: JwtService;
  let ownerId: string;
  let peerId: string;
  const run = randomUUID();
  let scope = '';
  const ids: string[] = [];
  const keys = new Set<string>();
  class ScopedStorage extends AuthRateLimitStorage {
    override increment(
      key: string,
      ttl: number,
      limit: number,
      block: number,
      name: string,
    ) {
      const scoped = `${run}:${scope}:${key}`;
      keys.add(`_throttler:{${scoped}}:${name}`);
      keys.add(`_throttler:{${scoped}}:${name}:block`);
      return super.increment(scoped, ttl, limit, block, name);
    }
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useFactory({
        factory: (client: RedisClientType) => new ScopedStorage(client),
        inject: [RedisToken()],
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisToken());
    jwt = app.get(JwtService);
    for (const label of ['owner', 'peer']) {
      const user = await prisma.user.create({
        data: {
          fullName: `Synthetic ${label}`,
          email: `${randomUUID()}@admin-profile-test.example`,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      ids.push(user.id);
    }
    [ownerId, peerId] = ids;
  });
  beforeEach(() => {
    scope = randomUUID();
  });
  afterAll(async () => {
    try {
      if (prisma && ids.length)
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      if (redis?.isReady && keys.size) await redis.del([...keys]);
    } finally {
      await app?.close();
    }
  });
  const token = (id: string) =>
    jwt.sign(
      { sub: id, email: 'synthetic@admin-profile-test.example', role: 'ADMIN' },
      { expiresIn: '15m' },
    );
  const read = (id = ownerId) =>
    request(app.getHttpServer())
      .get('/admin/profile')
      .auth(token(id), { type: 'bearer' });
  const rename = (fullName: string, expectedUpdatedAt: string) =>
    request(app.getHttpServer())
      .post('/admin/profile/name')
      .auth(token(ownerId), { type: 'bearer' })
      .send({ fullName, expectedUpdatedAt });
  it('persists a name for fresh authenticated reads while leaving another Admin unchanged', async () => {
    const before = (await read().expect(200)).body;
    const peer = await prisma.user.findUniqueOrThrow({ where: { id: peerId } });
    await rename('مسؤول تجريبي محفوظ', before.updatedAt).expect(200);
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    expect(saved.fullName).toBe('مسؤول تجريبي محفوظ');
    expect((await read().expect(200)).body.fullName).toBe(saved.fullName);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: peerId } }),
    ).toEqual(peer);
  });
  it('allows one concurrent update for a shared version without losing a saved change', async () => {
    const before = (await read().expect(200)).body;
    const result = await Promise.all([
      rename('Concurrent A', before.updatedAt),
      rename('Concurrent B', before.updatedAt),
    ]);
    expect(result.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const winner = result.find((r) => r.status === 200)!;
    expect((await read().expect(200)).body.fullName).toBe(winner.body.fullName);
  });
  it('cannot mutate account lifecycle, role, email or another Admin through self-service', async () => {
    const before = (await read().expect(200)).body;
    await request(app.getHttpServer())
      .post('/admin/profile/name')
      .auth(token(ownerId), { type: 'bearer' })
      .send({
        fullName: 'Injected',
        expectedUpdatedAt: before.updatedAt,
        userId: peerId,
        role: 'PARENT',
        status: 'SUSPENDED',
        email: 'injected@example.com',
      })
      .expect(400);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    expect(stored.role).toBe('ADMIN');
    expect(stored.status).toBe('ACTIVE');
    expect(stored.email).toBe(before.email);
    expect(stored.fullName).toBe(before.fullName);
  });
  it('revokes access when the current database account is suspended', async () => {
    const oldToken = token(peerId);
    await prisma.user.update({
      where: { id: peerId },
      data: { status: 'SUSPENDED' },
    });
    await request(app.getHttpServer())
      .get('/admin/profile')
      .auth(oldToken, { type: 'bearer' })
      .expect(401);
  });
});
