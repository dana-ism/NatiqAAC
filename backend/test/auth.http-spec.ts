import { RedisToken } from '@nestjs-redis/client';
import {
  INestApplication,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import { hash } from 'bcrypt';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AdminController } from '../src/admin/admin.controller';
import { SpecialistAdminController } from '../src/specialist/specialist.controller';
import { SpecialistService } from '../src/specialist/specialist.service';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { LoginProtectionService } from '../src/auth/login-protection.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/configure-app';
import { AccountLifecycleService } from '../src/auth/account-lifecycle.service';
import { EmailDomainService } from '../src/auth/email-domain.service';
import { GmailMailerService } from '../src/mail/gmail-mailer.service';

// Real Nest HTTP, DTOs, bcrypt, Passport, signature verification and rate guard.
// Only database/Redis operations are replaced; no AppModule or env file is loaded.
const secret = 'natiqaac-http-tests-synthetic-secret-only';
const id = '6fbbe1de-542e-409e-bbec-088c6c084416';
const password = 'TestPass123!';
const registration = {
  fullName: ' Test Parent ',
  email: ' Parent@Example.com ',
  password,
};
describe('Authentication HTTP contract (no external infrastructure)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let passwordHash: string;
  let user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    status: string;
    passwordHash: string;
    legacyAuthExempt: boolean;
  };
  const prisma = {
    mailDelivery: { upsert: jest.fn(), updateMany: jest.fn() },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const protection = {
    check: jest.fn(),
    recordFailure: jest.fn(),
    finalizeSuccess: jest.fn(),
  };
  const specialist = { summary: jest.fn() };
  beforeAll(async () => {
    passwordHash = await hash(password, 12);
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    specialist.summary.mockResolvedValue({ pendingCount: 140 });
    user = {
      legacyAuthExempt: true,
      id,
      fullName: 'Test Parent',
      email: 'parent@example.com',
      role: 'PARENT',
      status: 'ACTIVE',
      passwordHash,
    };
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.mailDelivery.upsert.mockResolvedValue({
      id: 'delivery',
      status: 'PENDING',
    });
    prisma.mailDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findMany.mockResolvedValue([user]);
    prisma.user.findUnique.mockImplementation(async () => user);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id,
      ...data,
      passwordHash: undefined,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }));
    const fixture = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: 900 },
        }),
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', limit: 20, ttl: 60000 }],
          storage: new ThrottlerStorageService(),
        }),
      ],
      controllers: [AuthController, AdminController, SpecialistAdminController],
      providers: [
        { provide: SpecialistService, useValue: specialist },
        AuthService,
        AccountLifecycleService,
        {
          provide: EmailDomainService,
          useValue: {
            validateForRegistration: async (email: string) =>
              email.trim().toLowerCase(),
          },
        },
        {
          provide: GmailMailerService,
          useValue: { isConfigured: () => false },
        },
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_SECRET: secret,
            PUBLIC_WEB_ORIGIN: 'https://natiq.example',
          }),
        },
        { provide: PrismaService, useValue: prisma },
        { provide: LoginProtectionService, useValue: protection },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService);
  });

  it('returns an exact pending summary only to a current active Admin', async () => {
    await request(app.getHttpServer())
      .get('/admin/specialist-applications/summary')
      .expect(401);
    user.role = 'ADMIN';
    const result = await request(app.getHttpServer())
      .get('/admin/specialist-applications/summary')
      .auth(meToken(jwt, { role: 'ADMIN' }), { type: 'bearer' })
      .expect(200);
    expect(result.body).toEqual({ pendingCount: 140 });
    expect(specialist.summary).toHaveBeenCalledTimes(1);
  });
  it.each(['PARENT', 'SPECIALIST'])(
    'denies a stale Admin claim when the current role is %s',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .get('/admin/specialist-applications/summary')
        .auth(meToken(jwt, { role: 'ADMIN' }), { type: 'bearer' })
        .expect(403);
      expect(specialist.summary).not.toHaveBeenCalled();
    },
  );
  it('denies a suspended Admin before accessing the pending summary', async () => {
    user.role = 'ADMIN';
    user.status = 'SUSPENDED';
    await request(app.getHttpServer())
      .get('/admin/specialist-applications/summary')
      .auth(meToken(jwt, { role: 'ADMIN' }), { type: 'bearer' })
      .expect(401);
    expect(specialist.summary).not.toHaveBeenCalled();
  });
  afterEach(async () => {
    if (app) await app.close();
  });
  const meToken = (jwt: JwtService, overrides: Record<string, unknown> = {}) =>
    jwt.sign({
      sub: id,
      email: 'parent@example.com',
      role: 'PARENT',
      ...overrides,
    });

  it('authorizes Admin with the current database role, not stale JWT claims', async () => {
    user.role = 'ADMIN';
    const token = meToken(jwt);
    const response = await request(app.getHttpServer())
      .get('/admin/overview')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual({
      account: { email: user.email, role: 'ADMIN' },
    });
    user.role = 'PARENT';
    await request(app.getHttpServer())
      .get('/admin/overview')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });
  it.each(['PARENT', 'SPECIALIST'])(
    'rejects current %s despite an ADMIN token',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .get('/admin/overview')
        .auth(meToken(jwt, { role: 'ADMIN' }), { type: 'bearer' })
        .expect(403);
    },
  );
  it.each(['PENDING', 'SUSPENDED'])('rejects %s Admin', async (status) => {
    user.role = 'ADMIN';
    user.status = status;
    await request(app.getHttpServer())
      .get('/admin/overview')
      .auth(meToken(jwt, { role: 'ADMIN' }), { type: 'bearer' })
      .expect(401);
  });
  it('rejects missing, invalid and deleted identities and preserves persistence failures', async () => {
    await request(app.getHttpServer()).get('/admin/overview').expect(401);
    await request(app.getHttpServer())
      .get('/admin/overview')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/admin/overview')
      .auth(meToken(jwt), { type: 'bearer' })
      .expect(401);
    prisma.user.findUnique.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );
    await request(app.getHttpServer())
      .get('/admin/overview')
      .auth(meToken(jwt), { type: 'bearer' })
      .expect(503);
  });

  it('wires the production modules and fails closed in the actual Redis throttler path', async () => {
    // Override infrastructure providers BEFORE compilation; never construct real clients.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    let productionApp: INestApplication | undefined;
    try {
      const { AppModule } = await import('../src/app.module.js');
      const securityClient = {
        isReady: true,
        isOpen: true,
        destroy: jest.fn(),
        eval: jest.fn().mockResolvedValue(0),
        scriptLoad: jest.fn().mockResolvedValue('a'.repeat(40)),
        evalSha: jest.fn().mockResolvedValue([1, 60000, -1, 0]),
      };
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(RedisToken())
        .useValue(securityClient)
        .overrideProvider(ConfigService)
        .useValue(new ConfigService({ JWT_SECRET: secret }))
        .compile();
      productionApp = fixture.createNestApplication();
      productionApp.useLogger(false);
      configureApp(productionApp);
      await productionApp.init();
      const login = await request(productionApp.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password })
        .expect(200);
      const payload = jwt.verify<{ exp: number; iat: number }>(
        login.body.access_token,
        { algorithms: ['HS256'] },
      );
      expect(payload.exp - payload.iat).toBe(900);
      await request(productionApp.getHttpServer())
        .get('/auth/me')
        .auth(login.body.access_token, { type: 'bearer' })
        .expect(200);
      user.role = 'ADMIN';
      await request(productionApp.getHttpServer())
        .get('/admin/overview')
        .auth(login.body.access_token, { type: 'bearer' })
        .expect(200);
      user.role = 'PARENT';
      securityClient.evalSha.mockRejectedValue(
        Object.assign(new Error('synthetic transport failure'), {
          code: 'ECONNRESET',
        }),
      );
      const blocked = await request(productionApp.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password })
        .expect(503);
      expect(blocked.body).not.toHaveProperty('access_token');
      expect(blocked.body.message).not.toContain('transport');
    } finally {
      if (productionApp) await productionApp.close();
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('registers with normalization, ordinary role, HTTP 201 and no password hash', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration)
      .expect(201);
    expect(result.body.user).toMatchObject({
      fullName: 'Test Parent',
      email: 'parent@example.com',
      role: 'PARENT',
      status: 'ACTIVE',
    });
    expect(result.body.user).not.toHaveProperty('passwordHash');
    expect(result.body.user).not.toHaveProperty('password');
  });
  it('logs in with HTTP 200 and a 15-minute HS256 token', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registration.email, password })
      .expect(200);
    const payload = jwt.verify<{ sub: string; exp: number; iat: number }>(
      result.body.access_token,
      { algorithms: ['HS256'] },
    );
    expect(payload.sub).toBe(id);
    expect(payload.exp - payload.iat).toBe(900);
    expect(result.body.user).not.toHaveProperty('passwordHash');
    expect(protection.finalizeSuccess).toHaveBeenCalledWith(
      'parent@example.com',
    );
  });
  it('returns current database identity from /auth/me', async () => {
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .auth(meToken(jwt), { type: 'bearer' })
      .expect(200);
    expect(result.body).toEqual({
      userId: id,
      email: user.email,
      role: user.role,
    });
  });
  it.each([
    { ...registration, fullName: '   ' },
    { ...registration, fullName: 4 },
    { ...registration, email: 'invalid' },
    { ...registration, email: [] },
    { ...registration, password: 'short' },
    { ...registration, password: '\u0639'.repeat(37) },
    { ...registration, role: 'ADMIN' },
    { ...registration, status: 'ACTIVE' },
    { ...registration, unknown: true },
  ])('rejects invalid and privileged registration fields', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('validates login DTOs and unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'invalid', password })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password, role: 'ADMIN' })
      .expect(400);
  });
  it('returns duplicate registration HTTP 409', async () => {
    prisma.user.findFirst.mockResolvedValue({ id });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration)
      .expect(409);
  });
  it('rejects incorrect credentials and inactive login', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'WrongPass123!' })
      .expect(401);
    user.status = 'SUSPENDED';
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(403);
  });
  it('requires Bearer authentication', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
  });
  it('rejects bad signatures and unexpected algorithms', async () => {
    const other = new JwtService({ secret: 'another-synthetic-secret' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(meToken(other), { type: 'bearer' })
      .expect(401);
    const token = jwt.sign(
      { sub: id, email: user.email, role: user.role },
      { algorithm: 'HS512' },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
  it('rejects expired tokens and missing expiration', async () => {
    const expired = jwt.sign(
      { sub: id, email: user.email, role: user.role },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(expired, { type: 'bearer' })
      .expect(401);
    const noExpiry = new JwtService({ secret }).sign({
      sub: id,
      email: user.email,
      role: user.role,
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(noExpiry, { type: 'bearer' })
      .expect(401);
  });
  it('rejects malformed signed claims before querying Prisma', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(meToken(jwt, { sub: 'invalid' }), { type: 'bearer' })
      .expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('rejects deleted and newly suspended accounts', async () => {
    const token = meToken(jwt);
    user.status = 'SUSPENDED';
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
    prisma.user.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
  it('preserves lock retry data and sets Retry-After', async () => {
    protection.check.mockRejectedValue(
      new HttpException(
        { statusCode: 429, message: 'Locked', retryAfterSeconds: 30 },
        429,
      ),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(429);
    expect(response.headers['retry-after']).toBe('30');
    expect(response.body.retryAfterSeconds).toBe(30);
  });
  it('returns 503 without a token when final protection is unavailable', async () => {
    protection.finalizeSuccess.mockRejectedValue(
      new ServiceUnavailableException(
        'Authentication protection is temporarily unavailable',
      ),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(503);
    expect(response.body).not.toHaveProperty('access_token');
  });
  it('limits registration at 5 requests and keeps login at 20', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    const limited = await request(app.getHttpServer())
      .post('/auth/register')
      .send({})
      .expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++)
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(429);
  });
});
