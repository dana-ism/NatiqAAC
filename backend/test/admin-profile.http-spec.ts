import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AdminProfileController } from '../src/admin/admin-profile.controller';
import { AdminProfileService } from '../src/admin/admin-profile.service';
import { AvatarStorageService } from '../src/admin/avatar-storage.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/configure-app';

const id = 'f73d08cc-8a75-4dfd-aaec-edc2d2db68ee';
const secret = 'synthetic-admin-profile-http-secret-only';
describe('Own Admin profile HTTP contract (synthetic persistence)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let user: ReturnType<typeof fresh>;
  const fresh = () => ({
    id,
    fullName: 'Synthetic Admin',
    avatarKey: null as string | null,
    email: 'synthetic@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordHash: 'synthetic-not-a-real-hash',
    emailVerifiedAt: new Date('2026-01-01Z'),
    legacyAuthExempt: false,
    createdAt: new Date('2026-01-01Z'),
    updatedAt: new Date('2026-01-02Z'),
    identities: [{ provider: 'GOOGLE' }],
  });
  const prisma = { user: { findUnique: jest.fn(), updateMany: jest.fn() } };
  beforeEach(async () => {
    user = fresh();
    jest.resetAllMocks();
    prisma.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === id ? user : null,
    );
    prisma.user.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        where.id !== id ||
        where.role !== user.role ||
        where.status !== user.status ||
        where.updatedAt.getTime() !== user.updatedAt.getTime()
      )
        return { count: 0 };
      Object.assign(user, data, {
        updatedAt: new Date(user.updatedAt.getTime() + 1),
      });
      return { count: 1 };
    });
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret }),
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
      controllers: [AdminProfileController],
      providers: [
        AdminProfileService,
        {
          provide: AvatarStorageService,
          useValue: {
            upload: jest.fn(),
            download: jest.fn(),
            cleanup: jest.fn(),
          },
        },
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService);
  });
  afterEach(async () => app?.close());
  const token = () =>
    jwt.sign(
      { sub: id, email: user.email, role: 'ADMIN' },
      { expiresIn: '15m' },
    );
  const read = () =>
    request(app.getHttpServer())
      .get('/admin/profile')
      .auth(token(), { type: 'bearer' });
  const rename = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/admin/profile/name')
      .auth(token(), { type: 'bearer' })
      .send(body);

  it('projects real saved information and provider status without security internals', async () => {
    const result = await read().expect(200).expect('Cache-Control', 'no-store');
    expect(result.body).toEqual({
      fullName: user.fullName,
      hasAvatar: false,
      email: user.email,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      emailVerified: true,
      passwordEnabled: true,
      connectedProviders: ['GOOGLE'],
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /passwordHash|synthetic-not-a-real-hash|subject|legacyAuthExempt|userId/,
    );
  });
  it('rejects anonymous requests', async () => {
    await request(app.getHttpServer()).get('/admin/profile/avatar').expect(401);
    await request(app.getHttpServer())
      .post('/admin/profile/avatar')
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/profile/avatar/remove')
      .expect(401);
    await request(app.getHttpServer()).get('/admin/profile').expect(401);
    await request(app.getHttpServer())
      .post('/admin/profile/name')
      .send({})
      .expect(401);
  });
  it.each(['PARENT', 'SPECIALIST'])(
    'denies %s even with an old ADMIN claim',
    async (role) => {
      user.role = role;
      // A legacy exemption allows testing the ordinary role boundary for either role.
      user.legacyAuthExempt = true;
      await request(app.getHttpServer())
        .get('/admin/profile/avatar')
        .auth(token(), { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/admin/profile/avatar')
        .auth(token(), { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/admin/profile/avatar/remove')
        .auth(token(), { type: 'bearer' })
        .expect(403);
      await read().expect(403);
      await rename({
        fullName: 'Changed',
        expectedUpdatedAt: user.updatedAt.toISOString(),
      }).expect(403);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['SUSPENDED', 'PENDING'])('denies %s Admins', async (status) => {
    user.status = status;
    await request(app.getHttpServer())
      .get('/admin/profile/avatar')
      .auth(token(), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/profile/avatar')
      .auth(token(), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/profile/avatar/remove')
      .auth(token(), { type: 'bearer' })
      .expect(401);
    await read().expect(401);
    await rename({
      fullName: 'Changed',
      expectedUpdatedAt: user.updatedAt.toISOString(),
    }).expect(401);
  });
  it('does not infer email verification from legacy login exemption', async () => {
    Object.assign(user, { emailVerifiedAt: null, legacyAuthExempt: true });
    expect((await read().expect(200)).body.emailVerified).toBe(false);
  });
  it('persists a trimmed name and rejects a stale concurrent save', async () => {
    const expectedUpdatedAt = user.updatedAt.toISOString();
    const saved = await rename({
      fullName: '  مسؤول تجريبي  ',
      expectedUpdatedAt,
    }).expect(200);
    expect(saved.body.fullName).toBe('مسؤول تجريبي');
    await rename({ fullName: 'Overwrite', expectedUpdatedAt }).expect(409);
    expect((await read().expect(200)).body.fullName).toBe('مسؤول تجريبي');
  });
  it.each(['', '   ', 'x'.repeat(101), 'Hidden\nName', '\u202eName'])(
    'rejects invalid names %j',
    async (fullName) => {
      await rename({
        fullName,
        expectedUpdatedAt: user.updatedAt.toISOString(),
      }).expect(400);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['role', 'email', 'userId', 'status', 'passwordHash', 'avatarKey'])(
    'rejects mass assignment of %s',
    async (key) => {
      await rename({
        fullName: 'Changed',
        expectedUpdatedAt: user.updatedAt.toISOString(),
        [key]: 'injected',
      }).expect(400);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('requires a canonical version and never accepts arbitrary ownership paths', async () => {
    await rename({
      fullName: 'Changed',
      expectedUpdatedAt: 'yesterday',
    }).expect(400);
    await request(app.getHttpServer())
      .get('/admin/profile/another-account')
      .auth(token(), { type: 'bearer' })
      .expect(404);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
