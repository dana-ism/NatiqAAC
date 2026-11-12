import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisToken } from '@nestjs-redis/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RedisClientType } from 'redis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthRateLimitStorage } from '../src/auth/auth-rate-limit.storage';
import { EmailDomainService } from '../src/auth/email-domain.service';
import { normalizeEmail } from '../src/auth/normalize-email';
import {
  OAuthProviderService,
  type OAuthProvider,
  type ProviderIdentity,
} from '../src/auth/oauth-provider.service';
import { GmailMailerService } from '../src/mail/gmail-mailer.service';
import type { RenderedMail } from '../src/mail/mail.templates';
import { isolatedTestEnvironment } from './test-environment';

// Real HTTP/DTOs/JWT/PostgreSQL/Redis; provider transport, DNS and mail are
// synthetic. This suite does not prove Google/Meta configuration or live login.
isolatedTestEnvironment(process.env);

const opaque = () => randomBytes(32).toString('base64url');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
const redisKey = (kind: string, value: string) =>
  `auth:oauth:${kind}:${digest(value)}`;

describe('OAuth HTTP transport and account lifecycle on isolated infrastructure', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisClientType;
  const run = randomUUID();
  let scope = '';
  const emails = new Set<string>();
  const keys = new Set<string>();
  const identities = new Map<string, ProviderIdentity>();
  const authorizations = new Map<
    string,
    {
      provider: OAuthProvider;
      nonce: string;
      codeVerifier: string;
      codeChallenge: string;
    }
  >();
  const messages: { email: string; rendered: RenderedMail }[] = [];
  const previousOrigin = process.env.PUBLIC_WEB_ORIGIN;

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

  const provider = {
    createAuthorization: jest.fn(
      (
        chosen: OAuthProvider,
        transaction: {
          state: string;
          nonce: string;
          codeVerifier: string;
          codeChallenge: string;
        },
      ) => {
        keys.add(redisKey('state', transaction.state));
        authorizations.set(transaction.state, {
          provider: chosen,
          ...transaction,
        });
        const url = new URL(
          chosen === 'GOOGLE'
            ? 'https://accounts.google.com/o/oauth2/v2/auth'
            : 'https://www.facebook.com/dialog/oauth',
        );
        url.searchParams.set('state', transaction.state);
        return url.toString();
      },
    ),
    exchange: jest.fn(
      async (
        chosen: OAuthProvider,
        code: string,
        proof: { nonce: string; codeVerifier: string },
      ) => {
        const identity = identities.get(code);
        if (!identity || identity.provider !== chosen)
          throw new UnauthorizedException('Synthetic provider proof rejected');
        expect(proof.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(proof.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        return identity;
      },
    ),
  };

  const email = () => {
    const value = `${randomUUID().slice(0, 12)}-${run}@oauth-activation.example`;
    emails.add(value);
    return value;
  };
  const identity = (
    chosen: OAuthProvider,
    address = email(),
  ): ProviderIdentity => ({
    provider: chosen,
    subject: `synthetic-${randomUUID()}`,
    fullName: 'Synthetic OAuth Account',
    email: chosen === 'GOOGLE' ? address : undefined,
    emailTrusted: chosen === 'GOOGLE',
  });

  beforeAll(async () => {
    process.env.PUBLIC_WEB_ORIGIN = 'https://oauth-test.example';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useFactory({
        factory: (client: RedisClientType) => new ScopedStorage(client),
        inject: [RedisToken()],
      })
      .overrideProvider(OAuthProviderService)
      .useValue(provider)
      .overrideProvider(EmailDomainService)
      .useValue({
        validateForRegistration: async (value: string) => normalizeEmail(value),
      })
      .overrideProvider(GmailMailerService)
      .useValue({
        isConfigured: () => true,
        send: async (address: string, rendered: RenderedMail) => {
          messages.push({ email: address, rendered });
        },
      })
      .compile();
    app = fixture.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisToken());
  });

  beforeEach(() => {
    scope = randomUUID();
  });

  afterAll(async () => {
    try {
      if (prisma && emails.size)
        await prisma.user.deleteMany({ where: { email: { in: [...emails] } } });
      if (redis?.isReady && keys.size) await redis.del([...keys]);
    } finally {
      if (previousOrigin === undefined) delete process.env.PUBLIC_WEB_ORIGIN;
      else process.env.PUBLIC_WEB_ORIGIN = previousOrigin;
      await app?.close();
    }
  });

  async function start(
    chosen: OAuthProvider,
    intent: 'login' | 'register',
    role?: 'PARENT' | 'SPECIALIST',
  ) {
    const verifier = opaque();
    const response = await request(app.getHttpServer())
      .post('/auth/oauth/start')
      .send({
        provider: chosen,
        intent,
        ...(role ? { role } : {}),
        challenge: digest(verifier),
      })
      .expect(200);
    const state = new URL(
      response.body.authorizationUrl as string,
    ).searchParams.get('state')!;
    const pending = JSON.parse((await redis.get(redisKey('state', state)))!);
    const authorization = authorizations.get(state)!;
    expect(authorization.codeChallenge).toBe(
      digest(authorization.codeVerifier),
    );
    expect(pending).toMatchObject({
      provider: chosen,
      intent,
      challenge: digest(verifier),
      nonce: authorization.nonce,
      codeVerifier: authorization.codeVerifier,
    });
    expect(await redis.pTTL(redisKey('state', state))).toBeGreaterThan(0);
    expect(await redis.pTTL(redisKey('state', state))).toBeLessThanOrEqual(
      600_000,
    );
    return { state, verifier, chosen };
  }

  async function callback(
    transaction: Awaited<ReturnType<typeof start>>,
    subject: ProviderIdentity,
  ) {
    const code = opaque();
    identities.set(code, subject);
    const response = await request(app.getHttpServer())
      .get(`/auth/oauth/${transaction.chosen.toLowerCase()}/callback`)
      .query({ state: transaction.state, code })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(response.text).toContain('https://oauth-test.example');
    const completionId = response.text.match(
      /"completionId":"([A-Za-z0-9_-]{43})"/,
    )?.[1];
    if (!completionId)
      throw new Error('Synthetic callback did not return completion proof');
    keys.add(redisKey('completion', completionId));
    expect(await redis.get(redisKey('state', transaction.state))).toBeNull();
    return { completionId, verifier: transaction.verifier };
  }

  const finish = (
    proof: { completionId: string; verifier: string },
    fields: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/auth/oauth/finish')
      .send({ ...proof, ...fields });

  it.each([
    ['GOOGLE', 'PARENT'],
    ['GOOGLE', 'SPECIALIST'],
    ['FACEBOOK', 'PARENT'],
    ['FACEBOOK', 'SPECIALIST'],
  ] as const)(
    '%s: registers %s, verifies local mail when required, then logs into the same account',
    async (chosen, role) => {
      const address = email();
      const subject = identity(chosen, address);
      const registration = await start(chosen, 'register', role);
      const proof = await callback(registration, subject);
      await request(app.getHttpServer())
        .post('/auth/oauth/context')
        .send({ ...proof, verifier: opaque() })
        .expect(401);
      for (let i = 0; i < 2; i++) {
        const context = await request(app.getHttpServer())
          .post('/auth/oauth/context')
          .send(proof)
          .expect(200);
        expect(context.body).toEqual({
          provider: chosen,
          fullName: subject.fullName,
          email: subject.email ?? null,
          emailTrusted: subject.emailTrusted,
          linked: false,
        });
      }
      const registered = await finish(proof, {
        fullName: 'Synthetic OAuth Account',
        email: address,
        ...(role === 'SPECIALIST'
          ? {
              specialization: 'Communication',
              qualification: 'Synthetic qualification',
            }
          : {}),
      }).expect(200);
      const id = registered.body.user.id as string;
      expect(registered.body.user).toMatchObject({
        role,
        status: 'ACTIVE',
        email: address,
      });
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id },
        include: { specialistApplication: true, identities: true },
      });
      expect(stored.passwordHash).toBeNull();
      expect(stored.legacyAuthExempt).toBe(false);
      expect(stored.identities).toHaveLength(1);
      expect(stored.identities[0]).toMatchObject({
        provider: chosen,
        subject: subject.subject,
      });
      expect(stored.emailVerifiedAt !== null).toBe(chosen === 'GOOGLE');
      if (role === 'SPECIALIST') {
        expect(stored.specialistApplication).toMatchObject({
          status: 'DRAFT',
          documentKey: null,
          submittedAt: null,
        });
      } else expect(stored.specialistApplication).toBeNull();
      if (chosen === 'FACEBOOK' || role === 'SPECIALIST') {
        expect(registered.body).not.toHaveProperty('access_token');
        await request(app.getHttpServer())
          .get('/auth/me')
          .auth(registered.body.onboarding_token, { type: 'bearer' })
          .expect(401);
      }
      if (chosen === 'FACEBOOK') {
        const token = messages
          .filter((m) => m.email === address)
          .at(-1)
          ?.rendered.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
        if (!token)
          throw new Error('Synthetic mailbox verification was not captured');
        await request(app.getHttpServer())
          .post('/auth/email/verify')
          .send({ token })
          .expect(200);
      }
      const loggedIn = await finish(
        await callback(await start(chosen, 'login'), subject),
      ).expect(200);
      expect(loggedIn.body.user.id).toBe(id);
      expect(loggedIn.body.user.role).toBe(role);
      expect(await prisma.user.count({ where: { email: address } })).toBe(1);
      const token =
        role === 'PARENT'
          ? loggedIn.body.access_token
          : loggedIn.body.onboarding_token;
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(role === 'PARENT' ? 200 : 401);
      await request(app.getHttpServer())
        .get('/admin/overview')
        .auth(token, { type: 'bearer' })
        .expect(role === 'PARENT' ? 403 : 401);
    },
  );

  it('rejects wrong-provider callbacks without consuming a valid state', async () => {
    const transaction = await start('GOOGLE', 'register', 'PARENT');
    const response = await request(app.getHttpServer())
      .get('/auth/oauth/facebook/callback')
      .query({ state: transaction.state, code: opaque() })
      .expect(200);
    expect(response.text).toContain('"error":true');
    expect(response.text).not.toContain('completionId');
    expect(
      await redis.get(redisKey('state', transaction.state)),
    ).not.toBeNull();
    await callback(transaction, identity('GOOGLE'));
  });

  it('preserves completion after a wrong browser proof, then consumes the correct proof exactly once', async () => {
    const subject = identity('GOOGLE');
    const proof = await callback(
      await start('GOOGLE', 'register', 'PARENT'),
      subject,
    );
    await finish({ ...proof, verifier: opaque() }).expect(401);
    expect(
      await redis.get(redisKey('completion', proof.completionId)),
    ).not.toBeNull();
    await finish(proof).expect(200);
    await finish(proof).expect(401);
    expect(
      await prisma.authIdentity.count({
        where: { provider: 'GOOGLE', subject: subject.subject },
      }),
    ).toBe(1);
  });

  it('rejects ADMIN and public linking injection before account creation or proof consumption', async () => {
    for (const body of [
      {
        provider: 'GOOGLE',
        intent: 'register',
        role: 'ADMIN',
        challenge: opaque(),
      },
      { provider: 'GOOGLE', intent: 'link', challenge: opaque() },
    ])
      await request(app.getHttpServer())
        .post('/auth/oauth/start')
        .send(body)
        .expect(400);
    const subject = identity('GOOGLE');
    const proof = await callback(
      await start('GOOGLE', 'register', 'PARENT'),
      subject,
    );
    await finish(proof, {
      role: 'ADMIN',
      status: 'ACTIVE',
      linkUserId: randomUUID(),
    }).expect(400);
    const result = await finish(proof).expect(200);
    expect(result.body.user.role).toBe('PARENT');
  });

  it('does not attach a different subject to an existing matching email', async () => {
    const subject = identity('GOOGLE');
    const existing = await prisma.user.create({
      data: {
        email: subject.email!,
        fullName: 'Synthetic Existing OAuth Parent',
        role: 'PARENT',
        emailVerifiedAt: new Date(),
      },
    });
    const proof = await callback(
      await start('GOOGLE', 'register', 'PARENT'),
      subject,
    );
    await finish(proof).expect(409);
    expect(
      await prisma.authIdentity.count({ where: { userId: existing.id } }),
    ).toBe(0);
    expect(await prisma.user.count({ where: { email: subject.email } })).toBe(
      1,
    );
  });

  it('does not silently register an unknown identity through login', async () => {
    const subject = identity('GOOGLE');
    await finish(
      await callback(await start('GOOGLE', 'login'), subject),
    ).expect(409);
    expect(await prisma.user.count({ where: { email: subject.email } })).toBe(
      0,
    );
  });

  it('allows only one concurrent callback and finish against real Redis', async () => {
    const subject = identity('GOOGLE');
    const transaction = await start('GOOGLE', 'register', 'PARENT');
    const code = opaque();
    identities.set(code, subject);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .get('/auth/oauth/google/callback')
          .query({ state: transaction.state, code })
          .expect(200),
      ),
    );
    const completions = responses.flatMap(
      (response) =>
        response.text.match(/"completionId":"([A-Za-z0-9_-]{43})"/)?.[1] ?? [],
    );
    expect(completions).toHaveLength(1);
    const completionId = completions[0];
    keys.add(redisKey('completion', completionId));
    const finishes = await Promise.all(
      [1, 2].map(() =>
        finish({ completionId, verifier: transaction.verifier }),
      ),
    );
    expect(
      finishes.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 401]);
    expect(
      await prisma.authIdentity.count({
        where: { provider: 'GOOGLE', subject: subject.subject },
      }),
    ).toBe(1);
  });

  it('keeps the five-per-minute OAuth initiation limit on isolated Redis', async () => {
    for (let n = 0; n < 6; n++)
      await request(app.getHttpServer())
        .post('/auth/oauth/start')
        .send({ provider: 'GOOGLE', intent: 'login', challenge: opaque() })
        .expect(n === 5 ? 429 : 200);
  });
});
