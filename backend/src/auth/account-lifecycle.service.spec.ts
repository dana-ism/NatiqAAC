import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcrypt';
import { Prisma, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailMailerService } from '../mail/gmail-mailer.service';
import { EmailDomainService } from './email-domain.service';
import {
  AccountLifecycleService,
  tokenHash,
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_TTL_MS,
} from './account-lifecycle.service';

const ACCOUNT: User = {
  id: 'a93039d6-fac7-4a14-a77b-895ed204564d',
  fullName: 'Synthetic Parent',
  email: 'parent@institution.ps',
  passwordHash: 'synthetic-existing-hash',
  role: 'PARENT',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  emailVerifiedAt: null,
  legacyAuthExempt: false,
  locale: 'en',
};
const DTO = {
  fullName: ' Synthetic Parent ',
  email: ' Parent@Institution.ps ',
  password: 'Synthetic!Pass123',
  locale: 'en' as const,
};
const TOKEN = 'A'.repeat(43);
const GENERIC = {
  message: 'If verification is needed, an email will be requested',
};

describe('AccountLifecycleService with isolated database/mail substitutes', () => {
  const tx = {
    emailVerification: { findUnique: jest.fn(), updateMany: jest.fn() },
    user: { update: jest.fn() },
    mailDelivery: { upsert: jest.fn() },
  };
  const prisma = {
    user: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    emailVerification: { updateMany: jest.fn() },
    mailDelivery: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const domains = { validateForRegistration: jest.fn() };
  const mailer = { isConfigured: jest.fn(), send: jest.fn() };
  let service: AccountLifecycleService;
  let warning: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    service = new AccountLifecycleService(
      prisma as unknown as PrismaService,
      domains as unknown as EmailDomainService,
      mailer as unknown as GmailMailerService,
      new ConfigService({ PUBLIC_WEB_ORIGIN: 'https://natiq.example' }),
    );
    domains.validateForRegistration.mockResolvedValue(ACCOUNT.email);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ ...ACCOUNT });
    prisma.user.findMany.mockResolvedValue([{ ...ACCOUNT }]);
    prisma.mailDelivery.upsert.mockResolvedValue({
      id: 'delivery',
      status: 'PENDING',
    });
    prisma.mailDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.mailDelivery.update.mockResolvedValue({
      id: 'delivery',
      status: 'ACCEPTED',
    });
    prisma.mailDelivery.findMany.mockResolvedValue([]);
    tx.mailDelivery.upsert.mockResolvedValue({
      id: 'durable-welcome',
      status: 'PENDING',
    });
    prisma.emailVerification.updateMany.mockResolvedValue({ count: 1 });
    tx.emailVerification.findUnique.mockResolvedValue({
      userId: ACCOUNT.id,
      tokenHash: tokenHash(TOKEN),
    });
    tx.emailVerification.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({
      ...ACCOUNT,
      emailVerifiedAt: new Date(),
    });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    mailer.isConfigured.mockReturnValue(false);
    mailer.send.mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('registers normalized identity with bcrypt, hashed expiring token and explicit safe response', async () => {
    const before = Date.now();
    const result = await service.register(DTO, 'PARENT');
    expect(domains.validateForRegistration).toHaveBeenCalledWith(DTO.email);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: ACCOUNT.email, mode: 'insensitive' } },
      select: { id: true },
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      fullName: 'Synthetic Parent',
      email: ACCOUNT.email,
      role: 'PARENT',
      status: 'ACTIVE',
      legacyAuthExempt: false,
      locale: 'en',
    });
    expect(await compare(DTO.password, data.passwordHash as string)).toBe(true);
    expect(data.passwordHash).toMatch(/^\$2[ab]\$12\$/u);
    const challenge = data.verification.create;
    expect(challenge.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(challenge.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + VERIFICATION_TTL_MS,
    );
    expect(challenge.resendAfter.getTime()).toBeGreaterThanOrEqual(
      before + VERIFICATION_COOLDOWN_MS,
    );
    expect(challenge).not.toHaveProperty('token');
    expect(data.mailDeliveries).toEqual({
      create: {
        eventKey: `verify:${challenge.tokenHash}`,
        kind: 'verification',
      },
    });
    expect(result).toEqual({
      message: 'Email verification required',
      user: {
        id: ACCOUNT.id,
        fullName: ACCOUNT.fullName,
        email: ACCOUNT.email,
        role: 'PARENT',
        status: 'ACTIVE',
        createdAt: ACCOUNT.createdAt,
      },
      verification: { emailSent: false },
    });
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain(challenge.tokenHash);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('stores only the digest of the random token actually sent in a fragment link', async () => {
    mailer.isConfigured.mockReturnValue(true);
    const result = await service.register(DTO, 'PARENT');
    expect(result.verification.emailSent).toBe(true);
    const rendered = mailer.send.mock.calls[0][1];
    const match = rendered.text.match(
      /https:\/\/natiq\.example\/verify-email#token=([A-Za-z0-9_-]{43})/u,
    );
    expect(match).not.toBeNull();
    const raw = match![1] as string;
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.verification.create.tokenHash).toBe(tokenHash(raw));
    expect(JSON.stringify(prisma.user.create.mock.calls)).not.toContain(raw);
    expect(prisma.mailDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventKey: `verify:${tokenHash(raw)}` },
      }),
    );
  });

  it('creates a specialist draft profile and preserves separate email/professional states', async () => {
    prisma.user.create.mockResolvedValue({ ...ACCOUNT, role: 'SPECIALIST' });
    await service.register(
      {
        ...DTO,
        specialization: 'Speech communication',
        qualification: 'Synthetic qualification',
        summary: 'Professional summary',
      },
      'SPECIALIST',
    );
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe('SPECIALIST');
    expect(data.specialistApplication).toEqual({
      create: {
        specialization: 'Speech communication',
        qualification: 'Synthetic qualification',
        summary: 'Professional summary',
      },
    });
    expect(data.specialistApplication.create).not.toHaveProperty(
      'status',
      'APPROVED',
    );
    expect(data).not.toHaveProperty('emailVerifiedAt');
  });

  it('rejects UTF-8 passwords exceeding bcrypt byte limit before persistence or DNS', async () => {
    await expect(
      service.register({ ...DTO, password: '🙂'.repeat(19) }, 'PARENT'),
    ).rejects.toThrow(BadRequestException);
    expect(domains.validateForRegistration).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('preserves domain-validation failure without creating accounts or sending mail', async () => {
    const error = new BadRequestException('Invalid email domain');
    domains.validateForRegistration.mockRejectedValue(error);
    await expect(service.register(DTO, 'PARENT')).rejects.toBe(error);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('rejects a case-insensitive duplicate without persisting', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: ACCOUNT.id });
    await expect(service.register(DTO, 'PARENT')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('maps database uniqueness races to 409', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic conflict', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.register(DTO, 'PARENT')).rejects.toThrow(
      ConflictException,
    );
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('consumes a valid token conditionally inside a transaction then welcomes a parent', async () => {
    mailer.isConfigured.mockReturnValue(true);
    await expect(service.verify(TOKEN)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.emailVerification.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: tokenHash(TOKEN) },
    });
    expect(tx.emailVerification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: ACCOUNT.id,
        tokenHash: tokenHash(TOKEN),
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT.id },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(prisma.mailDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: ACCOUNT.id,
          eventKey: `welcome:${ACCOUNT.id}`,
          kind: 'welcome',
        },
      }),
    );
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown token without consuming or sending', async () => {
    tx.emailVerification.findUnique.mockResolvedValue(null);
    await expect(service.verify(TOKEN)).rejects.toThrow('invalid or expired');
    expect(tx.emailVerification.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('rejects expired or already-consumed challenges when conditional update affects zero rows', async () => {
    // The real database evaluates expiresAt and consumedAt predicates; this unit
    // substitute exercises rejection of its zero-row verdict, not real DB locking.
    tx.emailVerification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verify(TOKEN)).rejects.toThrow('invalid or expired');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(prisma.mailDelivery.upsert).not.toHaveBeenCalled();
  });

  it('allows one simulated consumption winner and rejects replay without duplicate welcome', async () => {
    tx.emailVerification.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await service.verify(TOKEN);
    await expect(service.verify(TOKEN)).rejects.toThrow(BadRequestException);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.mailDelivery.upsert).toHaveBeenCalledTimes(1);
  });

  it('verifies specialist email without issuing an activation welcome or approving the application', async () => {
    tx.user.update.mockResolvedValue({
      ...ACCOUNT,
      role: 'SPECIALIST',
      emailVerifiedAt: new Date(),
    });
    await expect(service.verify(TOKEN)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(prisma.mailDelivery.upsert).not.toHaveBeenCalled();
    expect(tx.user.update.mock.calls[0][0].data).toEqual({
      emailVerifiedAt: expect.any(Date),
    });
  });

  it('keeps successful verification intact when welcome delivery is uncertain', async () => {
    mailer.isConfigured.mockReturnValue(true);
    mailer.send.mockRejectedValue(new Error('synthetic provider failure'));
    await expect(service.verify(TOKEN)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.mailDelivery.update).not.toHaveBeenCalled();
  });

  it('returns the same resend response for absent/ambiguous/ineligible users without mutation', async () => {
    for (const users of [
      [],
      [ACCOUNT, ACCOUNT],
      [{ ...ACCOUNT, emailVerifiedAt: new Date() }],
      [{ ...ACCOUNT, legacyAuthExempt: true }],
      [{ ...ACCOUNT, status: 'SUSPENDED' }],
    ]) {
      prisma.user.findMany.mockResolvedValueOnce(users);
      await expect(service.resend(' Parent@Institution.ps ')).resolves.toEqual(
        GENERIC,
      );
    }
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { equals: ACCOUNT.email, mode: 'insensitive' } },
      take: 2,
    });
    expect(prisma.emailVerification.updateMany).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('honors resend cooldown atomically without sending or revealing account state', async () => {
    prisma.emailVerification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resend(ACCOUNT.email)).resolves.toEqual(GENERIC);
    expect(prisma.emailVerification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: ACCOUNT.id,
        consumedAt: null,
        resendAfter: { lte: expect.any(Date) },
      },
      data: {
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        expiresAt: expect.any(Date),
        resendAfter: expect.any(Date),
      },
    });
    expect(prisma.mailDelivery.upsert).not.toHaveBeenCalled();
  });

  it('rotates resend token and sends only the new raw token while persisting its digest', async () => {
    mailer.isConfigured.mockReturnValue(true);
    await expect(service.resend(ACCOUNT.email)).resolves.toEqual(GENERIC);
    const update = prisma.emailVerification.updateMany.mock.calls[0][0];
    const rendered = mailer.send.mock.calls[0][1];
    const raw = rendered.text.match(
      /#token=([A-Za-z0-9_-]{43})/u,
    )![1] as string;
    expect(update.data.tokenHash).toBe(tokenHash(raw));
    expect(
      update.data.resendAfter.getTime() -
        update.where.resendAfter.lte.getTime(),
    ).toBe(VERIFICATION_COOLDOWN_MS);
    expect(
      update.data.expiresAt.getTime() - update.where.resendAfter.lte.getTime(),
    ).toBe(VERIFICATION_TTL_MS);
    expect(
      JSON.stringify(prisma.emailVerification.updateMany.mock.calls),
    ).not.toContain(raw);
    expect(prisma.mailDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: ACCOUNT.id,
          eventKey: `verify:${tokenHash(raw)}`,
          kind: 'verification-resend',
        },
      }),
    );
  });

  it('reports unsent mail when adapter is disabled and records FAILED without delivery claims', async () => {
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    expect(prisma.mailDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('reuses an accepted delivery result without sending or claiming again', async () => {
    prisma.mailDelivery.upsert.mockResolvedValue({
      id: 'delivery',
      status: 'ACCEPTED',
    });
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(true);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.mailDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('claims an event UNKNOWN before sending and records ACCEPTED only after provider acceptance', async () => {
    mailer.isConfigured.mockReturnValue(true);
    mailer.send.mockImplementation(async () => {
      expect(prisma.mailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery', status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'UNKNOWN', attemptedAt: expect.any(Date) },
      });
      expect(prisma.mailDelivery.update).not.toHaveBeenCalled();
    });
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(true);
    expect(prisma.mailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery' },
      data: { status: 'ACCEPTED' },
    });
  });

  it('does not resend an UNKNOWN event after uncertain provider acceptance', async () => {
    mailer.isConfigured.mockReturnValue(true);
    mailer.send.mockRejectedValueOnce(new Error('synthetic timeout'));
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    prisma.mailDelivery.upsert.mockResolvedValue({
      id: 'delivery',
      status: 'UNKNOWN',
    });
    prisma.mailDelivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.mailDelivery.update).not.toHaveBeenCalled();
  });

  it('avoids duplicate send when the event claim is lost to another sender', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('keeps acceptance uncertain when provider accepted but database acknowledgement failed', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.update.mockRejectedValue(
      new Error('synthetic database failure'),
    );
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.mailDelivery.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe public origins before registration creates an account', async () => {
    service = new AccountLifecycleService(
      prisma as unknown as PrismaService,
      domains as unknown as EmailDomainService,
      mailer as unknown as GmailMailerService,
      new ConfigService({ PUBLIC_WEB_ORIGIN: 'https://natiq.example/unsafe' }),
    );
    await expect(service.register(DTO, 'PARENT')).rejects.toThrow(
      'not configured',
    );
    expect(domains.validateForRegistration).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('persists parent welcome intent within the verification transaction before immediate dispatch', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.upsert.mockImplementation(async () => {
      expect(tx.mailDelivery.upsert).toHaveBeenCalledWith({
        where: { eventKey: `welcome:${ACCOUNT.id}` },
        create: {
          userId: ACCOUNT.id,
          eventKey: `welcome:${ACCOUNT.id}`,
          kind: 'welcome',
        },
        update: {},
      });
      return { id: 'delivery', status: 'PENDING' };
    });
    await expect(service.verify(TOKEN)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(tx.mailDelivery.upsert).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('does not commit the verification transaction if durable welcome intent cannot be written', async () => {
    tx.mailDelivery.upsert.mockRejectedValue(
      new Error('synthetic intent failure'),
    );
    await expect(service.verify(TOKEN)).rejects.toThrow(
      'synthetic intent failure',
    );
    // A rejected transaction callback rolls back in PostgreSQL. This unit test
    // verifies propagation, not physical rollback of the substituted database.
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.mailDelivery.upsert).not.toHaveBeenCalled();
  });

  it('keeps verification successful and its durable welcome pending when post-commit persistence fails', async () => {
    prisma.mailDelivery.upsert.mockRejectedValue(
      new Error('private endpoint and secret diagnostics'),
    );
    await expect(service.verify(TOKEN)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(tx.mailDelivery.upsert).toHaveBeenCalledTimes(1);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      'Account notification persistence is temporarily unavailable',
    );
  });

  it('bounds pending dispatch to twenty oldest known non-verification intents and reconstructs only fixed URLs', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.findMany.mockResolvedValue([
      { eventKey: `welcome:${ACCOUNT.id}`, kind: 'welcome', user: ACCOUNT },
      {
        eventKey: 'review:synthetic',
        kind: 'specialist-approved',
        user: ACCOUNT,
      },
    ]);
    const notify = jest.spyOn(service, 'notify').mockResolvedValue(true);
    await service.retryPendingNotifications();
    expect(prisma.mailDelivery.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        kind: {
          in: [
            'welcome',
            'application-received',
            'specialist-approved',
            'specialist-rejected',
          ],
        },
      },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    expect(notify).toHaveBeenNthCalledWith(
      1,
      ACCOUNT,
      'welcome',
      `welcome:${ACCOUNT.id}`,
      'https://natiq.example/login',
    );
    expect(notify).toHaveBeenNthCalledWith(
      2,
      ACCOUNT,
      'specialist-approved',
      'review:synthetic',
      'https://natiq.example/application-status',
    );
  });

  it('does not scan pending intents when outbound mail is disabled', async () => {
    await service.retryPendingNotifications();
    expect(prisma.mailDelivery.findMany).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('does not duplicate an intent claimed UNKNOWN between selection and dispatch', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.findMany.mockResolvedValue([
      { eventKey: 'event', kind: 'welcome', user: ACCOUNT },
    ]);
    prisma.mailDelivery.upsert.mockResolvedValue({
      id: 'delivery',
      status: 'UNKNOWN',
    });
    prisma.mailDelivery.updateMany.mockResolvedValue({ count: 0 });
    await service.retryPendingNotifications();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.mailDelivery.update).not.toHaveBeenCalled();
  });

  it('ignores unexpected verification kinds defensively even if an invalid substitute returns them', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.findMany.mockResolvedValue([
      { eventKey: 'verify:digest', kind: 'verification', user: ACCOUNT },
    ]);
    await service.retryPendingNotifications();
    expect(prisma.mailDelivery.upsert).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('preserves a pending event when the conditional claim cannot be persisted', async () => {
    mailer.isConfigured.mockReturnValue(true);
    prisma.mailDelivery.updateMany.mockRejectedValue(
      new Error('private synthetic claim failure'),
    );
    await expect(
      service.notify(
        ACCOUNT,
        'welcome',
        'event',
        'https://natiq.example/login',
      ),
    ).resolves.toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      'Account notification persistence is temporarily unavailable',
    );
  });
});
