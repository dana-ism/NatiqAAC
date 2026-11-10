import { INestApplication, NotFoundException } from '@nestjs/common';
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
import { EmailDomainService } from '../src/auth/email-domain.service';
import { normalizeEmail } from '../src/auth/normalize-email';
import { tokenHash } from '../src/auth/account-lifecycle.service';
import { GmailMailerService } from '../src/mail/gmail-mailer.service';
import type { RenderedMail } from '../src/mail/mail.templates';
import { DocumentStorageService } from '../src/specialist/document-storage.service';
import { configureApp } from '../src/configure-app';
import { isolatedTestEnvironment } from './test-environment';

// Refuse missing/misrouted infrastructure before constructing any real client.
isolatedTestEnvironment(process.env);

describe('Account V2 HTTP workflows on isolated PostgreSQL and Redis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisClientType;
  const previousOrigin = process.env.PUBLIC_WEB_ORIGIN;
  const run = randomUUID();
  const ids = new Set<string>();
  const emails = new Set<string>();
  const keys = new Set<string>();
  const messages: { email: string; rendered: RenderedMail }[] = [];
  const objects = new Map<string, Buffer>();
  const password = 'Synthetic!Account123';
  const pdf = Buffer.from('%PDF-1.7\nSynthetic qualification fixture\n%%EOF\n');
  const mailer = {
    isConfigured: () => true,
    send: jest.fn(async (email: string, rendered: RenderedMail) => {
      messages.push({ email, rendered });
    }),
  };
  const documents = {
    upload: jest.fn(async (data: Buffer, userId: string) => {
      const key = `${userId}/${randomUUID()}.pdf`;
      objects.set(key, Buffer.from(data));
      return {
        key,
        size: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    }),
    download: jest.fn(async (key: string) => {
      const stored = objects.get(key);
      if (!stored) throw new NotFoundException('Synthetic document missing');
      return Buffer.from(stored);
    }),
  };
  let parentToken: string;
  let adminToken: string;
  let adminId: string;
  let approvedApplicationId: string;
  let approvedSpecialistToken: string;

  class ScopedStorage extends AuthRateLimitStorage {
    override increment(
      key: string,
      ttl: number,
      limit: number,
      block: number,
      name: string,
    ) {
      const scoped = `${run}:${key}`;
      const stored = `_throttler:{${scoped}}:${name}`;
      keys.add(stored);
      keys.add(`${stored}:block`);
      return super.increment(scoped, ttl, limit, block, name);
    }
  }

  const syntheticEmail = (label: string) => {
    const email = `${label}-${run}@account-v2.example`;
    emails.add(email);
    return email;
  };
  const latestToken = (email: string) => {
    const message = messages
      .filter(
        (entry) =>
          entry.email === email && entry.rendered.text.includes('#token='),
      )
      .at(-1);
    const match = message?.rendered.text.match(/#token=([A-Za-z0-9_-]{43})/u);
    if (!match) throw new Error('Synthetic verification mail was not captured');
    return match[1];
  };
  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
  const register = async (role: 'parent' | 'specialist', label: string) => {
    const email = syntheticEmail(label);
    const response = await request(app.getHttpServer())
      .post(`/auth/register/${role}`)
      .send({
        fullName: 'Synthetic Account V2',
        email,
        password,
        locale: 'en',
        ...(role === 'specialist'
          ? {
              specialization: 'Speech communication',
              qualification: 'Synthetic university qualification',
              summary: 'Synthetic professional summary',
            }
          : {}),
      })
      .expect(201);
    ids.add(response.body.user.id);
    return {
      email,
      id: response.body.user.id as string,
      token: latestToken(email),
      response,
    };
  };
  const verify = (token: string) =>
    request(app.getHttpServer()).post('/auth/email/verify').send({ token });
  const bearerGet = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });

  beforeAll(async () => {
    process.env.PUBLIC_WEB_ORIGIN = 'https://natiq.example';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useFactory({
        factory: (client: RedisClientType) => new ScopedStorage(client),
        inject: [RedisToken()],
      })
      .overrideProvider(EmailDomainService)
      .useValue({
        validateForRegistration: async (email: string) => normalizeEmail(email),
      })
      .overrideProvider(GmailMailerService)
      .useValue(mailer)
      .overrideProvider(DocumentStorageService)
      .useValue(documents)
      .compile();
    app = fixture.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisToken());
    const passwordHash = await hash(password, 12);
    const adminEmail = syntheticEmail('admin');
    const parentEmail = syntheticEmail('permission-parent');
    const admin = await prisma.user.create({
      data: {
        fullName: 'Synthetic Admin V2',
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        legacyAuthExempt: true,
      },
    });
    ids.add(admin.id);
    adminId = admin.id;
    const parent = await prisma.user.create({
      data: {
        fullName: 'Synthetic Parent V2',
        email: parentEmail,
        passwordHash,
        role: 'PARENT',
        legacyAuthExempt: true,
      },
    });
    ids.add(parent.id);
    adminToken = (await login(adminEmail)).body.access_token;
    parentToken = (await login(parentEmail)).body.access_token;
  });

  afterAll(async () => {
    try {
      // Exact run-owned identities only. Includes any account created before an
      // HTTP assertion failed; no global table/Redis resets are permitted.
      if (prisma && (ids.size || emails.size))
        await prisma.user.deleteMany({
          where: {
            OR: [{ id: { in: [...ids] } }, { email: { in: [...emails] } }],
          },
        });
      for (const email of emails) {
        const prefix = `auth:login:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;
        for (const suffix of ['failures', 'stage', 'lock'])
          keys.add(`${prefix}:${suffix}`);
      }
      if (redis?.isReady && keys.size) await redis.del([...keys]);
    } finally {
      if (app) await app.close();
      if (previousOrigin === undefined) delete process.env.PUBLIC_WEB_ORIGIN;
      else process.env.PUBLIC_WEB_ORIGIN = previousOrigin;
      objects.clear();
    }
  });

  it('counts pending applications beyond the 100-row list cap and excludes other states', async () => {
    const before = await prisma.specialistApplication.count({
      where: { status: 'PENDING_REVIEW' },
    });
    const statuses = [
      ...Array.from({ length: 105 }, () => 'PENDING_REVIEW' as const),
      'DRAFT' as const,
      'APPROVED' as const,
      'REJECTED' as const,
    ];
    const owners = statuses.map((_, i) => {
      const id = randomUUID();
      ids.add(id);
      return {
        id,
        email: syntheticEmail(`summary-${i}`),
        fullName: 'Synthetic summary fixture',
        role: 'SPECIALIST' as const,
        status: 'ACTIVE' as const,
      };
    });
    await prisma.user.createMany({ data: owners });
    await prisma.specialistApplication.createMany({
      data: owners.map((u, i) => ({
        userId: u.id,
        specialization: 'Synthetic',
        qualification: 'Synthetic',
        status: statuses[i],
      })),
    });
    const summary = await bearerGet(
      '/admin/specialist-applications/summary',
      adminToken,
    ).expect(200);
    expect(summary.body).toEqual({ pendingCount: before + 105 });
    const list = await bearerGet(
      '/admin/specialist-applications',
      adminToken,
    ).expect(200);
    expect(list.body.applications).toHaveLength(100);
  });

  it('restricts a new parent until actual persisted token consumption then grants normal access', async () => {
    const parent = await register('parent', 'parent-flow');
    expect(parent.response.body).not.toHaveProperty('access_token');
    expect(parent.response.body.user).not.toHaveProperty('passwordHash');
    const challenge = await prisma.emailVerification.findUniqueOrThrow({
      where: { userId: parent.id },
    });
    expect(challenge.tokenHash).toBe(tokenHash(parent.token));
    expect(JSON.stringify(challenge)).not.toContain(parent.token);
    const pending = await login(parent.email.toUpperCase());
    expect(pending.body).not.toHaveProperty('access_token');
    expect(pending.body.onboarding_token).toEqual(expect.any(String));
    await bearerGet('/auth/me', pending.body.onboarding_token).expect(401);
    await bearerGet('/auth/onboarding/me', pending.body.onboarding_token)
      .expect(200)
      .expect(({ body }) => expect(body.emailVerified).toBe(false));
    await verify(parent.token).expect(200);
    await verify(parent.token).expect(400);
    const active = await login(parent.email);
    expect(active.body).not.toHaveProperty('onboarding_token');
    await bearerGet('/auth/me', active.body.access_token)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual({
          userId: parent.id,
          email: parent.email,
          role: 'PARENT',
        }),
      );
    const welcome = await prisma.mailDelivery.findUniqueOrThrow({
      where: { eventKey: `welcome:${parent.id}` },
    });
    expect(welcome.status).toBe('ACCEPTED');
    expect(
      (
        await prisma.emailVerification.findUniqueOrThrow({
          where: { userId: parent.id },
        })
      ).consumedAt,
    ).not.toBeNull();
  });

  it('serializes concurrent verification against PostgreSQL and emits one welcome', async () => {
    const parent = await register('parent', 'concurrent-parent');
    const outcomes = await Promise.all([
      verify(parent.token),
      verify(parent.token),
    ]);
    expect(
      outcomes
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 400]);
    expect(
      await prisma.mailDelivery.count({
        where: { eventKey: `welcome:${parent.id}` },
      }),
    ).toBe(1);
    const parentMessages = messages.filter(
      (message) => message.email === parent.email,
    );
    expect(parentMessages).toHaveLength(2); // verification plus one welcome
  });

  it('enforces resend cooldown generically, rotates the digest, and rejects the previous token', async () => {
    const parent = await register('parent', 'resend-parent');
    const generic = {
      message: 'If verification is needed, an email will be requested',
    };
    const resend = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/email/resend-verification')
        .send({ email })
        .expect(200);
    await resend(parent.email).expect(({ body }) =>
      expect(body).toEqual(generic),
    );
    expect(latestToken(parent.email)).toBe(parent.token);
    // Accelerate only this suite-owned challenge cooldown, never shared state.
    await prisma.emailVerification.update({
      where: { userId: parent.id },
      data: { resendAfter: new Date(Date.now() - 1) },
    });
    await resend(parent.email.toUpperCase()).expect(({ body }) =>
      expect(body).toEqual(generic),
    );
    const rotated = latestToken(parent.email);
    expect(rotated).not.toBe(parent.token);
    expect(
      (
        await prisma.emailVerification.findUniqueOrThrow({
          where: { userId: parent.id },
        })
      ).tokenHash,
    ).toBe(tokenHash(rotated));
    await resend(syntheticEmail('absent')).expect(({ body }) =>
      expect(body).toEqual(generic),
    );
    await verify(parent.token).expect(400);
    await verify(rotated).expect(200);
  });

  it('requires verified specialist email and a PDF before review, then grants approved access and stores an audit', async () => {
    const specialist = await register('specialist', 'approved-specialist');
    const pending = (await login(specialist.email)).body
      .onboarding_token as string;
    await request(app.getHttpServer())
      .post('/specialist/application/submit')
      .auth(pending, { type: 'bearer' })
      .expect(403);
    await verify(specialist.token).expect(200);
    await request(app.getHttpServer())
      .post('/specialist/application/submit')
      .auth(pending, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/specialist/application/document')
      .auth(pending, { type: 'bearer' })
      .attach('document', pdf, {
        filename: '../../untrusted.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    expect(documents.upload).toHaveBeenCalledWith(pdf, specialist.id);
    await request(app.getHttpServer())
      .post('/specialist/application/submit')
      .auth(pending, { type: 'bearer' })
      .expect(200);
    const application = await prisma.specialistApplication.findUniqueOrThrow({
      where: { userId: specialist.id },
    });
    approvedApplicationId = application.id;
    expect(application.status).toBe('PENDING_REVIEW');
    expect(application.documentSha256).toBe(
      createHash('sha256').update(pdf).digest('hex'),
    );
    expect(
      await prisma.mailDelivery.count({
        where: { eventKey: `welcome:${specialist.id}` },
      }),
    ).toBe(0);
    await bearerGet('/auth/me', pending).expect(401);
    await request(app.getHttpServer())
      .post(`/admin/specialist-applications/${application.id}/approve`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    const reviews = await prisma.specialistReview.findMany({
      where: { applicationId: application.id },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      reviewerId: adminId,
      decision: 'APPROVED',
      reason: null,
    });
    approvedSpecialistToken = (await login(specialist.email)).body.access_token;
    await bearerGet('/auth/me', approvedSpecialistToken).expect(200);
    // Existing restricted JWTs keep their limited purpose after approval.
    await bearerGet('/auth/me', pending).expect(401);
    expect(
      (
        await prisma.mailDelivery.findUniqueOrThrow({
          where: { eventKey: `welcome:${specialist.id}` },
        })
      ).status,
    ).toBe('ACCEPTED');
  });

  it('allows one PostgreSQL review winner under simultaneous approval/rejection and preserves the matching access state', async () => {
    const specialist = await register('specialist', 'review-race');
    await verify(specialist.token).expect(200);
    const pending = (await login(specialist.email)).body
      .onboarding_token as string;
    await request(app.getHttpServer())
      .post('/specialist/application/document')
      .auth(pending, { type: 'bearer' })
      .attach('document', pdf, 'qualification.pdf')
      .expect(200);
    await request(app.getHttpServer())
      .post('/specialist/application/submit')
      .auth(pending, { type: 'bearer' })
      .expect(200);
    const application = await prisma.specialistApplication.findUniqueOrThrow({
      where: { userId: specialist.id },
    });
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`/admin/specialist-applications/${application.id}/approve`)
        .auth(adminToken, { type: 'bearer' }),
      request(app.getHttpServer())
        .post(`/admin/specialist-applications/${application.id}/reject`)
        .auth(adminToken, { type: 'bearer' })
        .send({ reason: 'Synthetic qualification requires further review' }),
    ]);
    expect(
      results
        .map((result) => result.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 409]);
    const stored = await prisma.specialistApplication.findUniqueOrThrow({
      where: { id: application.id },
      include: { reviews: true },
    });
    expect(stored.reviews).toHaveLength(1);
    expect(stored.reviews[0].decision).toBe(stored.status);
    expect(stored.status).toBe(
      results[0].status === 200 ? 'APPROVED' : 'REJECTED',
    );
    const session = await login(specialist.email);
    if (stored.status === 'APPROVED')
      await bearerGet('/auth/me', session.body.access_token).expect(200);
    else {
      expect(session.body).not.toHaveProperty('access_token');
      await bearerGet('/auth/me', session.body.onboarding_token).expect(401);
    }
  });

  it('rejects parent review and a suspended admin token without adding audit decisions', async () => {
    const before = await prisma.specialistReview.count({
      where: { applicationId: approvedApplicationId },
    });
    await request(app.getHttpServer())
      .post(`/admin/specialist-applications/${approvedApplicationId}/approve`)
      .auth(parentToken, { type: 'bearer' })
      .expect(403);
    await prisma.user.update({
      where: { id: adminId },
      data: { status: 'SUSPENDED' },
    });
    try {
      await request(app.getHttpServer())
        .post(`/admin/specialist-applications/${approvedApplicationId}/approve`)
        .auth(adminToken, { type: 'bearer' })
        .expect(401);
    } finally {
      await prisma.user.update({
        where: { id: adminId },
        data: { status: 'ACTIVE' },
      });
    }
    expect(
      await prisma.specialistReview.count({
        where: { applicationId: approvedApplicationId },
      }),
    ).toBe(before);
  });

  it('serves attachments only to the owning specialist or active admin and hides storage references', async () => {
    for (const [path, token] of [
      ['/specialist/application/document', approvedSpecialistToken],
      [
        `/admin/specialist-applications/${approvedApplicationId}/document`,
        adminToken,
      ],
    ]) {
      await bearerGet(path, token)
        .expect(200)
        .expect('Content-Type', /application\/pdf/u)
        .expect(
          'Content-Disposition',
          'attachment; filename="qualification.pdf"',
        )
        .expect('X-Content-Type-Options', 'nosniff')
        .expect('Cache-Control', 'no-store')
        .expect(({ body }) => expect(body).toEqual(pdf));
    }
    const before = documents.download.mock.calls.length;
    await bearerGet(
      `/admin/specialist-applications/${approvedApplicationId}/document`,
      parentToken,
    ).expect(403);
    await bearerGet('/specialist/application/document', parentToken).expect(
      403,
    );
    const outsiderEmail = syntheticEmail('document-outsider');
    const outsider = await prisma.user.create({
      data: {
        fullName: 'Synthetic Other Specialist',
        email: outsiderEmail,
        passwordHash: await hash(password, 12),
        role: 'SPECIALIST',
        emailVerifiedAt: new Date(),
        specialistApplication: {
          create: {
            specialization: 'Communication',
            qualification: 'Synthetic qualification',
          },
        },
      },
    });
    ids.add(outsider.id);
    const outsiderToken = (await login(outsiderEmail)).body
      .onboarding_token as string;
    await bearerGet('/specialist/application/document', outsiderToken).expect(
      404,
    );
    expect(documents.download).toHaveBeenCalledTimes(before);
    await bearerGet('/specialist/application/me', approvedSpecialistToken)
      .expect(200)
      .expect(({ body }) => {
        expect(body.hasDocument).toBe(true);
        expect(body).not.toHaveProperty('documentKey');
        expect(body).not.toHaveProperty('documentSha256');
      });
  });
});
