import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisToken } from '@nestjs-redis/client';
import { createHash, randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import type { RedisClientType } from 'redis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthRateLimitStorage } from '../src/auth/auth-rate-limit.storage';
import { configureApp } from '../src/configure-app';
import { isolatedTestEnvironment } from './test-environment';
import { EmailDomainService } from '../src/auth/email-domain.service';
import { GmailMailerService } from '../src/mail/gmail-mailer.service';
import { normalizeEmail } from '../src/auth/normalize-email';

isolatedTestEnvironment(process.env);
describe('Authentication E2E on dedicated PostgreSQL and Redis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisClientType;
  const ids: string[] = [];
  const emails: string[] = [];
  const keys = new Set<string>();
  const run = randomUUID();
  let verificationToken = '';
  const previousOrigin = process.env.PUBLIC_WEB_ORIGIN;
  class ScopedStorage extends AuthRateLimitStorage {
    override increment(
      key: string,
      ttl: number,
      limit: number,
      block: number,
      name: string,
    ) {
      const scoped = run + ':' + key,
        stored = '_throttler:{' + scoped + '}:' + name;
      keys.add(stored);
      keys.add(stored + ':block');
      return super.increment(scoped, ttl, limit, block, name);
    }
  }
  beforeAll(async () => {
    process.env.PUBLIC_WEB_ORIGIN = 'https://natiq.example';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailDomainService)
      .useValue({
        validateForRegistration: async (email: string) => normalizeEmail(email),
      })
      .overrideProvider(GmailMailerService)
      .useValue({
        isConfigured: () => true,
        send: async (_email: string, mail: { text: string }) => {
          const match = mail.text.match(/#token=([A-Za-z0-9_-]{43})/);
          if (match) verificationToken = match[1];
        },
      })
      .overrideProvider(ThrottlerStorage)
      .useFactory({
        factory: (client: RedisClientType) => new ScopedStorage(client),
        inject: [RedisToken()],
      })
      .compile();
    app = fixture.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisToken());
  });
  afterAll(async () => {
    try {
      if (prisma && ids.length)
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      for (const email of emails) {
        const prefix =
          'auth:login:' +
          createHash('sha256').update(email.toLowerCase()).digest('hex');
        for (const suffix of ['failures', 'stage', 'lock'])
          keys.add(prefix + ':' + suffix);
      }
      if (redis?.isReady && keys.size) await redis.del([...keys]);
    } finally {
      if (app) await app.close();
      if (previousOrigin === undefined) delete process.env.PUBLIC_WEB_ORIGIN;
      else process.env.PUBLIC_WEB_ORIGIN = previousOrigin;
    }
  });
  it('registers, logs in and accesses /auth/me with real dependencies', async () => {
    const email = randomUUID() + '@example.com';
    emails.push(email);
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ fullName: ' Synthetic Parent ', email, password: 'TestPass123!' })
      .expect(201);
    ids.push(registered.body.user.id);
    expect(registered.body.user).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .post('/auth/email/verify')
      .send({ token: verificationToken })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email.toUpperCase(), password: 'TestPass123!' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(login.body.access_token, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          userId: registered.body.user.id,
          email,
          role: 'PARENT',
        });
      });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Duplicate',
        email: email.toUpperCase(),
        password: 'TestPass123!',
      })
      .expect(409);
  });
  it('supports a single mixed-case legacy identity without updating its email', async () => {
    const email = 'Legacy-' + randomUUID() + '@Example.com';
    emails.push(email);
    const user = await prisma.user.create({
      data: {
        fullName: 'Synthetic Legacy',
        legacyAuthExempt: true,
        email,
        passwordHash: await hash('TestPass123!', 12),
      },
    });
    ids.push(user.id);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email.toLowerCase(), password: 'TestPass123!' })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(email);
  });
});
