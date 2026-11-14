import {
  BadRequestException,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AvatarStorageService } from '../src/admin/avatar-storage.service';
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
  // Real Sharp/HTTP/JWT/Prisma/Redis; only the remote private-object transport is synthetic.
  const objects = new Map<string, Buffer>();
  const storage = new AvatarStorageService(new ConfigService({}));
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
    jest
      .spyOn(storage, 'upload')
      .mockImplementation(async (data, mime, owner) => {
        const bytes = await storage.normalize(data, mime);
        const key = `${owner}/${randomUUID()}.webp`;
        objects.set(key, bytes);
        return key;
      });
    jest.spyOn(storage, 'download').mockImplementation(async (key, owner) => {
      if (!key.startsWith(`${owner}/`))
        throw new BadRequestException('Invalid owner');
      const bytes = objects.get(key);
      if (!bytes) throw new NotFoundException();
      return bytes;
    });
    jest.spyOn(storage, 'remove').mockImplementation(async (key, owner) => {
      if (!key.startsWith(`${owner}/`))
        throw new BadRequestException('Invalid owner');
      const row = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
      // Cleanup must never delete an image still referenced by this account.
      expect(row.avatarKey).not.toBe(key);
      objects.delete(key);
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AvatarStorageService)
      .useValue(storage)
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
      objects.clear();
      jest.restoreAllMocks();
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
  const png = (background = '#194b49') =>
    sharp({ create: { width: 24, height: 24, channels: 3, background } })
      .png()
      .toBuffer();
  const photo = (bytes: Buffer, version: string, id = ownerId) =>
    request(app.getHttpServer())
      .post('/admin/profile/avatar')
      .auth(token(id), { type: 'bearer' })
      .field('expectedUpdatedAt', version)
      .attach('avatar', bytes, {
        filename: 'synthetic.png',
        contentType: 'image/png',
      });
  it('rehearses the exact additive migration on transaction-local legacy fixtures without changing saved fields', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE users (id TEXT PRIMARY KEY, full_name TEXT, role TEXT, status TEXT, updated_at TIMESTAMP(3)) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO users VALUES ('synthetic-legacy-active','Synthetic existing Admin','ADMIN','ACTIVE','2026-01-01'),('synthetic-legacy-suspended','Synthetic existing Parent','PARENT','SUSPENDED','2026-01-02')`;
      const bound = await tx.$queryRaw<
        { fixture: boolean }[]
      >`SELECT to_regclass('users')::oid = to_regclass('pg_temp.users')::oid AS fixture`;
      expect(bound[0].fixture).toBe(true);
      const original =
        await tx.$queryRaw`SELECT * FROM pg_temp.users ORDER BY id`;
      const sql = readFileSync(
        resolve(
          __dirname,
          '../prisma/migrations/20261114000100_admin_avatar/migration.sql',
        ),
        'utf8',
      );
      await tx.$executeRawUnsafe(sql);
      const after = await tx.$queryRaw<
        (Record<string, unknown> & { avatar_key: null })[]
      >`SELECT * FROM pg_temp.users ORDER BY id`;
      expect(
        after.map(({ avatar_key, ...row }) => {
          expect(avatar_key).toBeNull();
          return row;
        }),
      ).toEqual(original);
    });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }),
    ).toEqual(before);
  });
  it('persists upload/replace/remove and retrieves only private sanitized bytes across fresh JWTs', async () => {
    const peer = await prisma.user.findUniqueOrThrow({ where: { id: peerId } });
    const initial = (await read().expect(200)).body;
    const first = (await photo(await png(), initial.updatedAt).expect(200))
      .body;
    expect(first.hasAvatar).toBe(true);
    expect(first).not.toHaveProperty('avatarKey');
    const row1 = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    expect(objects.has(row1.avatarKey!)).toBe(true);
    const response = await request(app.getHttpServer())
      .get('/admin/profile/avatar')
      .auth(token(ownerId), { type: 'bearer' })
      .expect(200)
      .expect('Content-Type', 'image/webp')
      .expect('Cache-Control', 'private, no-store')
      .expect('X-Content-Type-Options', 'nosniff');
    expect((await sharp(response.body as Buffer).metadata()).format).toBe(
      'webp',
    );
    const second = (
      await photo(await png('#b76e50'), first.updatedAt).expect(200)
    ).body;
    const row2 = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    expect(row2.avatarKey).not.toBe(row1.avatarKey);
    expect(objects.has(row1.avatarKey!)).toBe(false);
    expect((await read().expect(200)).body.hasAvatar).toBe(true);
    await request(app.getHttpServer())
      .post('/admin/profile/avatar/remove')
      .auth(token(ownerId), { type: 'bearer' })
      .send({ expectedUpdatedAt: first.updatedAt })
      .expect(409);
    const removed = await request(app.getHttpServer())
      .post('/admin/profile/avatar/remove')
      .auth(token(ownerId), { type: 'bearer' })
      .send({ expectedUpdatedAt: second.updatedAt })
      .expect(200);
    expect(removed.body.hasAvatar).toBe(false);
    expect(objects.has(row2.avatarKey!)).toBe(false);
    await request(app.getHttpServer())
      .get('/admin/profile/avatar')
      .auth(token(ownerId), { type: 'bearer' })
      .expect(404);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: peerId } }),
    ).toEqual(peer);
  });
  it('cleans the losing concurrent upload and prevents stale photo writes from overwriting a name', async () => {
    const before = (await read().expect(200)).body;
    const bytes = await png();
    const results = await Promise.all([
      photo(bytes, before.updatedAt),
      photo(bytes, before.updatedAt),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect([...objects.keys()]).toEqual([row.avatarKey]);
    await rename('New name after photo', row.updatedAt.toISOString()).expect(
      200,
    );
    const count = objects.size;
    await photo(bytes, row.updatedAt.toISOString()).expect(409);
    expect(objects.size).toBe(count);
  });
  it('does not leak a peer image through owner IDs, arbitrary routes, or multipart injection', async () => {
    const peer = (await read(peerId).expect(200)).body;
    await photo(await png('white'), peer.updatedAt, peerId).expect(200);
    const own = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    const image = await request(app.getHttpServer())
      .get(`/admin/profile/avatar?userId=${peerId}`)
      .auth(token(ownerId), { type: 'bearer' })
      .expect(200);
    expect(image.body).toEqual(objects.get(own.avatarKey!));
    await request(app.getHttpServer())
      .get(`/admin/profile/${peerId}/avatar`)
      .auth(token(ownerId), { type: 'bearer' })
      .expect(404);
    const count = objects.size;
    await request(app.getHttpServer())
      .post('/admin/profile/avatar')
      .auth(token(ownerId), { type: 'bearer' })
      .field('expectedUpdatedAt', own.updatedAt.toISOString())
      .field('userId', peerId)
      .attach('avatar', await png(), {
        filename: 'synthetic.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(objects.size).toBe(count);
  });
  it('rejects invalid content and oversized HTTP multipart bodies without objects or DB changes', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const count = objects.size;
    await photo(Buffer.from('<svg/>'), before.updatedAt.toISOString()).expect(
      400,
    );
    await photo(
      Buffer.alloc(2 * 1024 * 1024 + 1),
      before.updatedAt.toISOString(),
    ).expect(413);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }),
    ).toEqual(before);
    expect(objects.size).toBe(count);
  });
  it('cleans a newly stored image if persistence fails, preserving the saved avatar', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const previous = [...objects.keys()].sort();
    const failure = jest
      .spyOn(prisma.user, 'updateMany')
      .mockRejectedValueOnce(new Error('Synthetic DB write failure'));
    try {
      await photo(await png(), before.updatedAt.toISOString()).expect(500);
    } finally {
      failure.mockRestore();
    }
    expect([...objects.keys()].sort()).toEqual(previous);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }),
    ).toEqual(before);
  });
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
