import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AccountSessionService } from './account-session.service';
import {
  AccountLifecycleService,
  tokenHash,
} from './account-lifecycle.service';
import { EmailDomainService } from './email-domain.service';
import { OAuthAccountsService } from './oauth-accounts.service';
import type { OAuthCompletion } from './oauth-flow.service';

const userId = 'b3e66354-7fa7-4597-9246-6e9ca674c99b';
const base: OAuthCompletion = {
  identity: {
    provider: 'GOOGLE',
    subject: 'synthetic-subject',
    email: 'parent@gmail.com',
    fullName: 'Parent',
    emailTrusted: true,
  },
  intent: 'register',
  role: 'PARENT',
};
describe('OAuthAccountsService', () => {
  let service: OAuthAccountsService;
  let prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    authIdentity: { findUnique: jest.Mock; create: jest.Mock };
    user: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let sessions: { issue: jest.Mock };
  let lifecycle: { publicOrigin: jest.Mock; notify: jest.Mock };
  let domains: { validateForRegistration: jest.Mock };
  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: userId }]),
      authIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'identity' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, status: 'ACTIVE' }),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...data, id: userId }),
          ),
      },
    };
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );
    sessions = {
      issue: jest
        .fn()
        .mockResolvedValue({ access_token: 'synthetic-platform-token' }),
    };
    lifecycle = {
      publicOrigin: jest.fn().mockReturnValue('https://app.example.org'),
      notify: jest.fn().mockResolvedValue(false),
    };
    domains = {
      validateForRegistration: jest
        .fn()
        .mockImplementation((email: string) =>
          Promise.resolve(email.trim().toLowerCase()),
        ),
    };
    service = new OAuthAccountsService(
      prisma as unknown as PrismaService,
      sessions as unknown as AccountSessionService,
      lifecycle as unknown as AccountLifecycleService,
      domains as unknown as EmailDomainService,
    );
  });
  it('creates trusted Google parent without a password or local verification challenge', async () => {
    await service.complete(base, {});
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'PARENT',
        passwordHash: null,
        legacyAuthExempt: false,
        emailVerifiedAt: expect.any(Date),
        identities: {
          create: { provider: 'GOOGLE', subject: 'synthetic-subject' },
        },
      }),
    });
    expect(
      prisma.user.create.mock.calls[0][0].data.verification,
    ).toBeUndefined();
    expect(lifecycle.notify).toHaveBeenCalledWith(
      expect.anything(),
      'welcome',
      `welcome:${userId}`,
      'https://app.example.org/login',
    );
    expect(sessions.issue).toHaveBeenCalledWith(userId);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.mailDeliveries.create).toEqual({
      kind: 'welcome',
      eventKey: `welcome:${data.id}`,
    });
  });
  it('does not auto-verify a different supplied mailbox', async () => {
    await service.complete(base, { email: 'other@example.org' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeNull();
    const link = lifecycle.notify.mock.calls[0][3] as string;
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
      'token',
    )!;
    expect(data.verification.create.tokenHash).toBe(tokenHash(token));
    expect(data.verification.create.tokenHash).not.toContain(token);
    expect(data.mailDeliveries.create).toEqual({
      kind: 'verification',
      eventKey: `verify:${tokenHash(token)}`,
    });
    expect(
      data.verification.create.expiresAt.getTime() -
        data.verification.create.resendAfter.getTime(),
    ).toBe(59 * 60_000);
  });
  it('never trusts a Facebook email even if upstream accidentally marks it trusted', async () => {
    await service.complete(
      {
        ...base,
        identity: {
          ...base.identity,
          provider: 'FACEBOOK',
          emailTrusted: true,
        },
      },
      {},
    );
    expect(prisma.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeNull();
    expect(lifecycle.notify.mock.calls[0][1]).toBe('verification');
  });
  it('requires supplied email when Facebook omits it', async () => {
    const transaction = {
      ...base,
      identity: {
        ...base.identity,
        provider: 'FACEBOOK' as const,
        email: undefined,
        emailTrusted: false,
      },
    };
    await expect(service.complete(transaction, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.complete(transaction, { email: 'parent@example.org' });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
  it('refuses matching email automatic identity attachment', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'another-account' });
    await expect(service.complete(base, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('handles a unique identity/email registration race without returning another account session', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic constraint failure', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.complete(base, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('handles concurrent linking collision without issuing a session', async () => {
    prisma.authIdentity.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic constraint failure', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.complete(
        { identity: base.identity, intent: 'link', linkUserId: userId },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('logs in existing provider subject without changing roles or requiring DNS', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue({ userId });
    await service.complete({ ...base, role: 'SPECIALIST' }, {});
    expect(sessions.issue).toHaveBeenCalledWith(userId);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(domains.validateForRegistration).not.toHaveBeenCalled();
  });
  it('requires unknown identities to choose registration', async () => {
    await expect(
      service.complete({ ...base, intent: 'login', role: undefined }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects ADMIN public role injection', async () => {
    await expect(
      service.complete(
        { ...base, role: 'ADMIN' } as unknown as OAuthCompletion,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('requires specialist professional details and keeps verified specialists in DRAFT', async () => {
    await expect(
      service.complete({ ...base, role: 'SPECIALIST' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.complete(
      { ...base, role: 'SPECIALIST' },
      {
        specialization: 'Speech communication',
        qualification: 'Bachelor degree',
      },
    );
    expect(
      prisma.user.create.mock.calls[0][0].data.specialistApplication.create,
    ).toEqual({
      specialization: 'Speech communication',
      qualification: 'Bachelor degree',
      summary: undefined,
      status: 'DRAFT',
    });
    expect(lifecycle.notify).not.toHaveBeenCalled();
  });
  it('links only to the account authenticated at initiation without modifying user state', async () => {
    await service.complete(
      { identity: base.identity, intent: 'link', linkUserId: userId },
      {},
    );
    expect(prisma.authIdentity.create).toHaveBeenCalledWith({
      data: { userId, provider: 'GOOGLE', subject: base.identity.subject },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(sessions.issue).toHaveBeenCalledWith(userId);
    const [query, id] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(query.join('?')).toContain("status = 'ACTIVE' FOR UPDATE");
    expect(id).toBe(userId);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.authIdentity.create.mock.invocationCallOrder[0],
    );
  });
  it('rejects linking identity belonging to another user rather than logging into that user', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue({
      userId: 'another-user',
    });
    await expect(
      service.complete(
        { identity: base.identity, intent: 'link', linkUserId: userId },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('rejects another identity for an already connected provider', async () => {
    prisma.authIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-connection' });
    await expect(
      service.complete(
        { identity: base.identity, intent: 'link', linkUserId: userId },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
  });
  it('rechecks suspension when linking completes', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(
      service.complete(
        { identity: base.identity, intent: 'link', linkUserId: userId },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
  });
  it('treats linking the same identity to its authenticated owner idempotently', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue({ userId });
    await service.complete(
      { identity: base.identity, intent: 'link', linkUserId: userId },
      {},
    );
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    expect(sessions.issue).toHaveBeenCalledWith(userId);
  });
});
