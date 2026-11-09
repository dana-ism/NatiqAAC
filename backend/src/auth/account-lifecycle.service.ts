import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type User } from '../generated/prisma/client';
import { GmailMailerService } from '../mail/gmail-mailer.service';
import {
  renderMailTemplate,
  type MailTemplateInput,
} from '../mail/mail.templates';
import { EmailDomainService } from './email-domain.service';
import { normalizeEmail } from './normalize-email';
import {
  ParentRegistrationDto,
  SpecialistRegistrationDto,
} from './dto/account.dto';

export const VERIFICATION_TTL_MS = 60 * 60 * 1000;
export const VERIFICATION_COOLDOWN_MS = 60 * 1000;
const RETRYABLE_NOTIFICATION_KINDS = [
  'welcome',
  'application-received',
  'specialist-approved',
  'specialist-rejected',
] as const;
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: EmailDomainService,
    private readonly mailer: GmailMailerService,
    private readonly config: ConfigService,
  ) {}

  publicOrigin(): string {
    const raw = this.config.get<string>('PUBLIC_WEB_ORIGIN');
    try {
      const url = new URL(raw ?? '');
      if (
        url.origin !== raw ||
        url.username ||
        url.password ||
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          ))
      )
        throw new Error();
      return url.origin;
    } catch {
      throw new BadRequestException(
        'Public application origin is not configured',
      );
    }
  }

  async register(
    dto: ParentRegistrationDto | SpecialistRegistrationDto,
    role: 'PARENT' | 'SPECIALIST',
  ) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException('Password must not exceed 72 bytes');
    const origin = this.publicOrigin();
    const email = await this.domains.validateForRegistration(dto.email);
    if (
      await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Email is already registered');
    }
    const token = randomBytes(32).toString('base64url');
    const digest = tokenHash(token);
    const now = Date.now();
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash: await hash(dto.password, 12),
          role,
          status: 'ACTIVE',
          legacyAuthExempt: false,
          locale: dto.locale ?? 'ar',
          verification: {
            create: {
              tokenHash: digest,
              expiresAt: new Date(now + VERIFICATION_TTL_MS),
              resendAfter: new Date(now + VERIFICATION_COOLDOWN_MS),
            },
          },
          // Persist intent atomically with the account/challenge. Verification
          // intents cannot be replayed by a worker: only the in-memory token can
          // construct their URL. Recovery requires an explicit resend/rotation.
          mailDeliveries: {
            create: { eventKey: `verify:${digest}`, kind: 'verification' },
          },
          ...(role === 'SPECIALIST'
            ? {
                specialistApplication: {
                  create: {
                    specialization: (dto as SpecialistRegistrationDto)
                      .specialization,
                    qualification: (dto as SpecialistRegistrationDto)
                      .qualification,
                    summary: (dto as SpecialistRegistrationDto).summary,
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
        throw new ConflictException('Email is already registered');
      throw error;
    }
    const emailSent = await this.notify(
      user,
      'verification',
      `verify:${digest}`,
      `${origin}/verify-email#token=${token}`,
    );
    return {
      message: 'Email verification required',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      verification: { emailSent },
    };
  }

  async verify(token: string) {
    const origin = this.publicOrigin();
    const digest = tokenHash(token);
    const user = await this.prisma.$transaction(async (tx) => {
      const challenge = await tx.emailVerification.findUnique({
        where: { tokenHash: digest },
      });
      if (!challenge)
        throw new BadRequestException(
          'Verification link is invalid or expired',
        );
      const now = new Date();
      const consumed = await tx.emailVerification.updateMany({
        where: {
          userId: challenge.userId,
          tokenHash: digest,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1)
        throw new BadRequestException(
          'Verification link is invalid or expired',
        );
      const verified = await tx.user.update({
        where: { id: challenge.userId },
        data: { emailVerifiedAt: now },
      });
      if (verified.role === 'PARENT')
        await tx.mailDelivery.upsert({
          where: { eventKey: `welcome:${verified.id}` },
          create: {
            userId: verified.id,
            eventKey: `welcome:${verified.id}`,
            kind: 'welcome',
          },
          update: {},
        });
      return verified;
    });
    if (user.role === 'PARENT')
      await this.notify(
        user,
        'welcome',
        `welcome:${user.id}`,
        `${origin}/login`,
      );
    return { message: 'Email verified successfully' };
  }

  async resend(emailInput: string) {
    const origin = this.publicOrigin();
    const generic = {
      message: 'If verification is needed, an email will be requested',
    };
    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizeEmail(emailInput), mode: 'insensitive' },
      },
      take: 2,
    });
    if (users.length !== 1) return generic;
    const user = users[0];
    if (
      user.emailVerifiedAt ||
      user.legacyAuthExempt ||
      user.status !== 'ACTIVE'
    )
      return generic;
    const token = randomBytes(32).toString('base64url');
    const digest = tokenHash(token);
    const now = new Date();
    const rotated = await this.prisma.emailVerification.updateMany({
      where: { userId: user.id, consumedAt: null, resendAfter: { lte: now } },
      data: {
        tokenHash: digest,
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
        resendAfter: new Date(now.getTime() + VERIFICATION_COOLDOWN_MS),
      },
    });
    if (rotated.count === 1)
      await this.notify(
        user,
        'verification-resend',
        `verify:${digest}`,
        `${origin}/verify-email#token=${token}`,
      );
    return generic;
  }

  async notify(
    user: User,
    kind: MailTemplateInput['kind'],
    eventKey: string,
    actionUrl: string,
  ): Promise<boolean> {
    try {
      return await this.deliverNotification(user, kind, eventKey, actionUrl);
    } catch {
      // State changes may already be committed. Report failure without hiding
      // it behind success or returning a false account-operation failure.
      this.logger.warn(
        'Account notification persistence is temporarily unavailable',
      );
      return false;
    }
  }

  /** Bounded DB outbox dispatch; verification URLs are deliberately unrecoverable. */
  async retryPendingNotifications(): Promise<void> {
    if (!this.mailer.isConfigured()) return;
    const origin = this.publicOrigin();
    const pending = await this.prisma.mailDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        kind: { in: [...RETRYABLE_NOTIFICATION_KINDS] },
      },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    for (const delivery of pending) {
      const kind = RETRYABLE_NOTIFICATION_KINDS.find(
        (value) => value === delivery.kind,
      );
      if (!kind) continue;
      await this.notify(
        delivery.user,
        kind,
        delivery.eventKey,
        `${origin}/${kind === 'welcome' ? 'login' : 'application-status'}`,
      );
    }
  }

  private async deliverNotification(
    user: User,
    kind: MailTemplateInput['kind'],
    eventKey: string,
    actionUrl: string,
  ): Promise<boolean> {
    const delivery = await this.prisma.mailDelivery.upsert({
      where: { eventKey },
      create: { userId: user.id, eventKey, kind },
      update: {},
    });
    if (delivery.status === 'ACCEPTED') return true;
    if (!this.mailer.isConfigured()) {
      await this.prisma.mailDelivery.updateMany({
        where: { id: delivery.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return false;
    }
    // Claim before sending; a crash/timeout must never trigger an automatic duplicate.
    const claimed = await this.prisma.mailDelivery.updateMany({
      where: { id: delivery.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'UNKNOWN', attemptedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    const base = {
      locale: user.locale === 'en' ? ('en' as const) : ('ar' as const),
      fullName: user.fullName,
      actionUrl,
    };
    try {
      const input: MailTemplateInput =
        kind === 'verification' || kind === 'verification-resend'
          ? { ...base, kind, expiresInMinutes: 60 }
          : { ...base, kind };
      await this.mailer.send(user.email, renderMailTemplate(input));
    } catch {
      // UNKNOWN means acceptance is uncertain. No provider payloads/tokens are logged.
      return false;
    }
    await this.prisma.mailDelivery.update({
      where: { id: delivery.id },
      data: { status: 'ACCEPTED' },
    });
    return true;
  }
}
