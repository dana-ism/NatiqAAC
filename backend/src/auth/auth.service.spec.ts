import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, compare } from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginProtectionService } from './login-protection.service';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { AccountLifecycleService } from './account-lifecycle.service';
import { EmailDomainService } from './email-domain.service';
import { GmailMailerService } from '../mail/gmail-mailer.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
const dto = {
  fullName: ' Test Parent ',
  email: ' Parent@Example.com ',
  password: 'TestPass123!',
};
const user = {
  id: '6fbbe1de-542e-409e-bbec-088c6c084416',
  fullName: 'Test Parent',
  email: 'Parent@Example.com',
  passwordHash: 'synthetic-hash',
  role: 'PARENT',
  status: 'ACTIVE',
  legacyAuthExempt: true,
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    mailDelivery: { upsert: jest.Mock; updateMany: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };
  let protection: {
    check: jest.Mock;
    recordFailure: jest.Mock;
    finalizeSuccess: jest.Mock;
  };
  beforeEach(() => {
    jest.resetAllMocks();
    prisma = {
      mailDelivery: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'delivery', status: 'PENDING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([user]),
        create: jest
          .fn()
          .mockResolvedValue({ ...user, passwordHash: undefined }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('synthetic-access-token') };
    protection = {
      check: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      finalizeSuccess: jest.fn().mockResolvedValue(undefined),
    };
    (hash as jest.Mock).mockResolvedValue('synthetic-hash');
    (compare as jest.Mock).mockResolvedValue(true);
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      protection as unknown as LoginProtectionService,
      new AccountLifecycleService(
        prisma as unknown as PrismaService,
        {
          validateForRegistration: async (email: string) =>
            email.trim().toLowerCase(),
        } as EmailDomainService,
        { isConfigured: () => false } as GmailMailerService,
        new ConfigService({ PUBLIC_WEB_ORIGIN: 'https://natiq.example' }),
      ),
    );
  });
  it('registers a normalized ordinary parent with explicit safe projection', async () => {
    await service.register(dto);
    expect(hash).toHaveBeenCalledWith(dto.password, 12);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'parent@example.com', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: 'Test Parent',
        email: 'parent@example.com',
        passwordHash: 'synthetic-hash',
        role: 'PARENT',
        status: 'ACTIVE',
        legacyAuthExempt: false,
        verification: {
          create: {
            tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            expiresAt: expect.any(Date),
            resendAfter: expect.any(Date),
          },
        },
      }),
    });
  });
  it('rejects a legacy mixed-case duplicate before hashing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: user.id });
    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    expect(hash).not.toHaveBeenCalled();
  });
  it('handles a concurrent database unique conflict', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Synthetic conflict', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    await expect(service.register(dto)).rejects.toThrow(ConflictException);
  });
  it('preserves unexpected database failures', async () => {
    const error = new Error('Synthetic database failure');
    prisma.user.create.mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
  });
  it.each(['a'.repeat(73), '\u0639'.repeat(37), '\u{1F600}'.repeat(19)])(
    'rejects oversized UTF-8 passwords without hashing',
    async (password) => {
      await expect(service.register({ ...dto, password })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.login({ ...dto, password })).rejects.toThrow(
        BadRequestException,
      );
      expect(hash).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    },
  );
  it.each(['\u0639'.repeat(36), '\u{1F600}'.repeat(18), '  TestPass123!  '])(
    'preserves valid Unicode and password whitespace',
    async (password) => {
      await service.register({ ...dto, password });
      expect(hash).toHaveBeenCalledWith(password, 12);
    },
  );
  it('allows a single legacy mixed-case user without rewriting it', async () => {
    const result = await service.login(dto);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { equals: 'parent@example.com', mode: 'insensitive' } },
      take: 2,
    });
    expect(protection.check).toHaveBeenCalledWith('parent@example.com');
    expect(protection.finalizeSuccess).toHaveBeenCalledWith(
      'parent@example.com',
    );
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe(user.email);
  });
  it.each([{ users: [] }, { users: [user, { ...user, id: 'other' }] }])(
    'rejects absent or ambiguous identities using a dummy comparison',
    async ({ users }) => {
      prisma.user.findMany.mockResolvedValue(users);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(compare).toHaveBeenCalledWith(dto.password, 'synthetic-hash');
      expect(protection.recordFailure).toHaveBeenCalledWith(
        'parent@example.com',
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    },
  );
  it('records an incorrect password and does not sign', async () => {
    (compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    expect(protection.recordFailure).toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'SUSPENDED'])(
    'rejects inactive status %s',
    async (status) => {
      prisma.user.findMany.mockResolvedValue([{ ...user, status }]);
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(protection.finalizeSuccess).not.toHaveBeenCalled();
    },
  );
  it('does not sign when the initial security check fails', async () => {
    protection.check.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.login(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('does not return a token if final Redis authorization fails', async () => {
    protection.finalizeSuccess.mockRejectedValue(
      new ServiceUnavailableException(),
    );
    await expect(service.login(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
  it('cannot clear a lock that appears while signing', async () => {
    jwt.signAsync.mockImplementation(async () => {
      protection.finalizeSuccess.mockRejectedValue(
        new HttpException('Locked', 429),
      );
      return 'discarded-synthetic-token';
    });
    await expect(service.login(dto)).rejects.toMatchObject({ status: 429 });
  });
  it('does not clear failures when JWT signing fails', async () => {
    const error = new Error('Synthetic signing error');
    jwt.signAsync.mockRejectedValue(error);
    await expect(service.login(dto)).rejects.toBe(error);
    expect(protection.finalizeSuccess).not.toHaveBeenCalled();
  });
});
