import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { DocumentStorageService } from './document-storage.service';
import { promoteSubmittedApplication } from './application-transition';

// Review visibility requires actual mailbox verification; legacy access exemptions
// still permit existing login but are never fabricated verification evidence.
export const reviewVisibility = {
  user: { emailVerifiedAt: { not: null } },
} as const;

@Injectable()
export class SpecialistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentStorageService,
    private readonly accounts: AccountLifecycleService,
  ) {}

  private async applicant(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { specialistApplication: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.role !== 'SPECIALIST')
      throw new ForbiddenException();
    if (!user.specialistApplication)
      throw new NotFoundException('Application not found');
    return user as typeof user & {
      specialistApplication: NonNullable<typeof user.specialistApplication>;
    };
  }

  async mine(userId: string) {
    const user = await this.applicant(userId);
    return this.project(user.specialistApplication.id);
  }

  async upload(userId: string, bytes: Buffer) {
    const user = await this.applicant(userId);
    if (
      user.specialistApplication.status !== 'DRAFT' ||
      user.specialistApplication.documentKey
    )
      throw new ConflictException('Document is already submitted');
    const stored = await this.documents.upload(bytes, userId);
    const result = await this.prisma.specialistApplication.updateMany({
      where: {
        id: user.specialistApplication.id,
        status: 'DRAFT',
        documentKey: null,
        user: { status: 'ACTIVE', role: 'SPECIALIST' },
      },
      data: {
        documentKey: stored.key,
        documentSize: stored.size,
        documentSha256: stored.sha256,
      },
    });
    if (result.count !== 1)
      throw new ConflictException('Application changed during upload');
    // A failed association can leave a private orphan. Never delete without retention policy.
    return { message: 'Qualification document saved' };
  }

  async submit(userId: string) {
    const origin = this.accounts.publicOrigin();
    const user = await this.applicant(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const changed = await tx.specialistApplication.updateMany({
        where: {
          id: user.specialistApplication.id,
          status: 'DRAFT',
          submittedAt: null,
          documentKey: { not: null },
          user: {
            status: 'ACTIVE',
            role: 'SPECIALIST',
          },
        },
        data: { submittedAt: new Date() },
      });
      if (changed.count !== 1) return { count: 0, applicationId: null };
      const applicationId = await promoteSubmittedApplication(tx, userId);
      return { count: 1, applicationId };
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Application requires a document or was already submitted',
      );
    if (result.applicationId)
      await this.accounts.notify(
        user,
        'application-received',
        `application:${user.specialistApplication.id}`,
        `${origin}/application-status`,
      );
    return {
      message: result.applicationId
        ? 'Application submitted for review'
        : 'Application saved; email verification required',
    };
  }

  async summary() {
    const pendingCount = await this.prisma.specialistApplication.count({
      where: { status: 'PENDING_REVIEW', ...reviewVisibility },
    });
    return { pendingCount };
  }

  async dashboard() {
    // One read snapshot keeps metrics and the bounded recent list coherent.
    return this.prisma.$transaction(
      async (tx) => {
        const groups = await tx.specialistApplication.groupBy({
          by: ['status'],
          where: reviewVisibility,
          _count: { _all: true },
        });
        const count = (status: string) =>
          groups.find((group) => group.status === status)?._count._all ?? 0;
        const recent = await tx.specialistApplication.findMany({
          where: {
            submittedAt: { not: null },
            status: { not: 'DRAFT' },
            ...reviewVisibility,
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          take: 5,
          select: {
            id: true,
            status: true,
            specialization: true,
            qualification: true,
            submittedAt: true,
            user: { select: { fullName: true, email: true } },
          },
        });
        return {
          pendingCount: count('PENDING_REVIEW'),
          approvedCount: count('APPROVED'),
          rejectedCount: count('REJECTED'),
          totalCount: groups.reduce((sum, group) => sum + group._count._all, 0),
          recentApplications: recent.map(({ user, ...application }) => ({
            ...application,
            ...user,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async list() {
    const applications = await this.prisma.specialistApplication.findMany({
      where: reviewVisibility,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        status: true,
        specialization: true,
        qualification: true,
        submittedAt: true,
        user: { select: { fullName: true, email: true } },
      },
    });
    return {
      applications: applications.map(({ user, ...app }) => ({
        ...app,
        ...user,
      })),
    };
  }

  private async project(id: string) {
    const app = await this.prisma.specialistApplication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        specialization: true,
        qualification: true,
        summary: true,
        documentKey: true,
        submittedAt: true,
        user: { select: { fullName: true, email: true } },
        reviews: {
          orderBy: { createdAt: 'asc' },
          select: { decision: true, reason: true, createdAt: true },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    const { documentKey, user, ...safe } = app;
    return { ...safe, ...user, hasDocument: !!documentKey };
  }

  async details(id: string) {
    await this.requireReviewVisibility(id);
    return { application: await this.project(id) };
  }

  private async requireReviewVisibility(id: string) {
    const app = await this.prisma.specialistApplication.findFirst({
      where: { id, ...reviewVisibility },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Application not found');
  }

  async document(applicationId: string, userId: string, admin: boolean) {
    if (admin) await this.requireReviewVisibility(applicationId);
    const app = await this.prisma.specialistApplication.findUnique({
      where: { id: applicationId },
      select: { userId: true, documentKey: true },
    });
    if (!app || (!admin && app.userId !== userId))
      throw new NotFoundException('Document not found');
    if (!app.documentKey) throw new NotFoundException('Document not found');
    return this.documents.download(app.documentKey);
  }

  async review(
    id: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    if (
      decision === 'REJECTED' &&
      (!reason || reason.trim().length < 10 || reason.length > 1000)
    )
      throw new BadRequestException(
        'A meaningful rejection reason is required',
      );
    const origin = this.accounts.publicOrigin();
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the current reviewer row: suspension/demotion and this decision serialize.
      const reviewer = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id = ${reviewerId}::uuid AND role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE`;
      if (reviewer.length !== 1) throw new ForbiddenException();
      const app = await tx.specialistApplication.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!app) throw new NotFoundException('Application not found');
      if (app.userId === reviewerId) throw new ForbiddenException();
      const eligible = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id = ${app.userId}::uuid AND role = 'SPECIALIST' AND status = 'ACTIVE' AND email_verified_at IS NOT NULL FOR UPDATE`;
      if (eligible.length !== 1)
        throw new ConflictException('Applicant is not eligible');
      if (app.user.status !== 'ACTIVE' || !app.user.emailVerifiedAt)
        throw new ConflictException('Applicant is not eligible');
      const changed = await tx.specialistApplication.updateMany({
        where: { id, status: 'PENDING_REVIEW' },
        data: { status: decision },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Application has already been reviewed or is incomplete',
        );
      await tx.specialistReview.create({
        data: {
          applicationId: id,
          reviewerId,
          decision,
          reason: decision === 'REJECTED' ? reason!.trim() : null,
        },
      });
      await tx.mailDelivery.upsert({
        where: { eventKey: `review:${id}` },
        create: {
          userId: app.userId,
          eventKey: `review:${id}`,
          kind:
            decision === 'APPROVED'
              ? 'specialist-approved'
              : 'specialist-rejected',
        },
        update: {},
      });
      if (decision === 'APPROVED')
        await tx.mailDelivery.upsert({
          where: { eventKey: `welcome:${app.userId}` },
          create: {
            userId: app.userId,
            eventKey: `welcome:${app.userId}`,
            kind: 'welcome',
          },
          update: {},
        });
      return app;
    });
    await this.accounts.notify(
      result.user,
      decision === 'APPROVED' ? 'specialist-approved' : 'specialist-rejected',
      `review:${id}`,
      `${origin}/application-status`,
    );
    if (decision === 'APPROVED')
      await this.accounts.notify(
        result.user,
        'welcome',
        `welcome:${result.userId}`,
        `${origin}/login`,
      );
    return {
      message:
        decision === 'APPROVED'
          ? 'Application approved'
          : 'Application rejected',
    };
  }
}
