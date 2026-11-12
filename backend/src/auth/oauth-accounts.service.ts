import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountLifecycleService,
  tokenHash,
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_TTL_MS,
} from './account-lifecycle.service';
import { AccountSessionService } from './account-session.service';
import { EmailDomainService } from './email-domain.service';
import { normalizeEmail } from './normalize-email';
import type { OAuthCompletion } from './oauth-flow.service';

export interface OAuthAccountInput {
  fullName?: string;
  email?: string;
  specialization?: string;
  qualification?: string;
  summary?: string;
  locale?: 'ar' | 'en';
}

@Injectable()
export class OAuthAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AccountSessionService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly domains: EmailDomainService,
  ) {}

  async context(transaction: OAuthCompletion) {
    const { identity } = transaction;
    const linked = await this.prisma.authIdentity.findUnique({
      where: {
        provider_subject: {
          provider: identity.provider,
          subject: identity.subject,
        },
      },
      select: { userId: true },
    });
    // Never project provider subject, local account details, or provider tokens.
    return {
      provider: identity.provider,
      fullName: identity.fullName,
      email: identity.email ?? null,
      emailTrusted: identity.emailTrusted,
      linked: !!linked,
    };
  }

  async complete(transaction: OAuthCompletion, input: OAuthAccountInput) {
    const { identity } = transaction;
    if (
      !['GOOGLE', 'FACEBOOK'].includes(identity.provider) ||
      !identity.subject ||
      !['login', 'register', 'link'].includes(transaction.intent) ||
      (transaction.intent === 'register' &&
        transaction.role !== 'PARENT' &&
        transaction.role !== 'SPECIALIST')
    ) {
      throw new BadRequestException('Invalid provider account request');
    }
    if (transaction.intent === 'link') {
      if (!transaction.linkUserId)
        throw new BadRequestException('Invalid provider linking request');
      const userId = transaction.linkUserId;
      try {
        await this.prisma.$transaction(async (tx) => {
          // Serialize this account-control mutation against suspension/deletion.
          // The authenticated initiator ID comes solely from server-side state.
          const owners = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM users WHERE id = ${userId}::uuid AND status = 'ACTIVE' FOR UPDATE`;
          if (owners.length !== 1)
            throw new ForbiddenException('Account is not active');
          const linked = await tx.authIdentity.findUnique({
            where: {
              provider_subject: {
                provider: identity.provider,
                subject: identity.subject,
              },
            },
            select: { userId: true },
          });
          if (linked && linked.userId !== userId)
            throw new ConflictException(
              'Provider identity is already connected to another account',
            );
          if (linked) return;
          const existing = await tx.authIdentity.findUnique({
            where: { userId_provider: { userId, provider: identity.provider } },
            select: { id: true },
          });
          if (existing)
            throw new ConflictException(
              'Account already has a connection to this provider',
            );
          await tx.authIdentity.create({
            data: {
              userId,
              provider: identity.provider,
              subject: identity.subject,
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException('Provider identity is already connected');
        throw error;
      }
      return this.sessions.issue(userId);
    }
    const linked = await this.prisma.authIdentity.findUnique({
      where: {
        provider_subject: {
          provider: identity.provider,
          subject: identity.subject,
        },
      },
      select: { userId: true },
    });
    if (linked) return this.sessions.issue(linked.userId);
    if (transaction.intent !== 'register')
      throw new ConflictException(
        'Please choose an account type and register first',
      );
    const role = transaction.role!;
    const fullName = (input.fullName ?? identity.fullName).trim();
    if (!fullName || fullName.length > 100)
      throw new BadRequestException('Full name is required');
    if (
      role === 'SPECIALIST' &&
      (!input.specialization ||
        input.specialization.trim().length < 2 ||
        input.specialization.length > 160 ||
        !input.qualification ||
        input.qualification.trim().length < 2 ||
        input.qualification.length > 200)
    ) {
      throw new BadRequestException(
        'Professional specialization and qualification are required',
      );
    }
    const origin = this.lifecycle.publicOrigin();
    const selectedEmail = input.email ?? identity.email;
    if (!selectedEmail)
      throw new BadRequestException(
        'Please provide an email address for verification',
      );
    const email = await this.domains.validateForRegistration(selectedEmail);
    if (
      await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'Email is already registered. Sign in to the existing account before connecting another identity',
      );
    }
    const verified =
      identity.provider === 'GOOGLE' &&
      identity.emailTrusted &&
      !!identity.email &&
      normalizeEmail(identity.email) === email;
    const token = verified ? undefined : randomBytes(32).toString('base64url');
    const digest = token ? tokenHash(token) : undefined;
    const newUserId = randomUUID();
    const now = new Date();
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          id: newUserId,
          fullName,
          email,
          passwordHash: null,
          role,
          status: 'ACTIVE',
          legacyAuthExempt: false,
          locale: input.locale ?? 'ar',
          emailVerifiedAt: verified ? now : null,
          identities: {
            create: { provider: identity.provider, subject: identity.subject },
          },
          ...(!verified || role === 'PARENT'
            ? {
                mailDeliveries: {
                  create: {
                    kind: verified ? 'welcome' : 'verification',
                    eventKey: verified
                      ? `welcome:${newUserId}`
                      : `verify:${digest}`,
                  },
                },
              }
            : {}),
          ...(!verified
            ? {
                verification: {
                  create: {
                    tokenHash: digest!,
                    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
                    resendAfter: new Date(
                      now.getTime() + VERIFICATION_COOLDOWN_MS,
                    ),
                  },
                },
              }
            : {}),
          ...(role === 'SPECIALIST'
            ? {
                specialistApplication: {
                  create: {
                    specialization: input.specialization!.trim(),
                    qualification: input.qualification!.trim(),
                    summary: input.summary?.trim(),
                    status: 'DRAFT',
                  },
                },
              }
            : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Account identity is already registered. Please sign in again',
        );
      throw error;
    }
    if (token)
      await this.lifecycle.notify(
        user,
        'verification',
        `verify:${digest}`,
        `${origin}/verify-email#token=${token}`,
      );
    else if (role === 'PARENT')
      await this.lifecycle.notify(
        user,
        'welcome',
        `welcome:${user.id}`,
        `${origin}/login`,
      );
    return this.sessions.issue(user.id);
  }
}
