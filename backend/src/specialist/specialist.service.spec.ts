import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { DocumentStorageService } from './document-storage.service';
import { reviewVisibility, SpecialistService } from './specialist.service';

const USER_ID = '304c9382-a1f5-4644-85ad-44ae1a703530';
const ADMIN_ID = 'ae434572-e5fb-4a92-8467-7e3b4d3ab974';
const APP_ID = '6bd0d720-ff13-4d8f-94f4-c6e985cb100c';
const PDF = Buffer.from('%PDF-1.7\nsynthetic\n%%EOF');
const user = () => ({
  id: USER_ID,
  role: 'SPECIALIST',
  status: 'ACTIVE',
  emailVerifiedAt: new Date(),
  legacyAuthExempt: false,
});
const application = () => ({
  id: APP_ID,
  userId: USER_ID,
  status: 'PENDING_REVIEW',
  documentKey: `${USER_ID}/synthetic.pdf`,
  user: user(),
});

describe('SpecialistService admission and transactional review', () => {
  const tx = {
    $queryRaw: jest.fn(),
    specialistApplication: { findUnique: jest.fn(), updateMany: jest.fn() },
    specialistReview: { create: jest.fn() },
    mailDelivery: { upsert: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    specialistApplication: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const documents = { upload: jest.fn(), download: jest.fn() };
  const accounts = {
    publicOrigin: () => 'https://natiq.example',
    notify: jest.fn(),
  };
  let service: SpecialistService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SpecialistService(
      prisma as unknown as PrismaService,
      documents as unknown as DocumentStorageService,
      accounts as unknown as AccountLifecycleService,
    );
    tx.$queryRaw.mockResolvedValue([{ id: ADMIN_ID }]);
    tx.specialistApplication.findUnique.mockResolvedValue(application());
    tx.specialistApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.specialistReview.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    prisma.user.findUnique.mockResolvedValue({
      ...user(),
      specialistApplication: {
        ...application(),
        status: 'DRAFT',
        documentKey: null,
      },
    });
    prisma.specialistApplication.updateMany.mockResolvedValue({ count: 1 });
    documents.upload.mockResolvedValue({
      key: `${USER_ID}/synthetic.pdf`,
      sha256: 'synthetic-digest',
      size: PDF.length,
    });
    documents.download.mockResolvedValue(PDF);
    accounts.notify.mockResolvedValue(true);
  });

  it.each([0, 7, 140])(
    'counts every pending review independently of the capped list: %s',
    async (count) => {
      prisma.specialistApplication.count.mockResolvedValue(count);
      await expect(service.summary()).resolves.toEqual({ pendingCount: count });
      expect(prisma.specialistApplication.count).toHaveBeenCalledWith({
        where: { status: 'PENDING_REVIEW', ...reviewVisibility },
      });
    },
  );

  it('does not replace a failed count with a misleading zero', async () => {
    prisma.specialistApplication.count.mockRejectedValue(
      new Error('Synthetic unavailable database'),
    );
    await expect(service.summary()).rejects.toThrow(
      'Synthetic unavailable database',
    );
  });

  it('locks the active current admin before changing status and writing the audit in one transaction', async () => {
    accounts.notify.mockImplementation(async () => {
      expect(tx.specialistReview.create).toHaveBeenCalledTimes(1);
      return true;
    });
    await expect(service.review(APP_ID, ADMIN_ID, 'APPROVED')).resolves.toEqual(
      { message: 'Application approved' },
    );
    const [query, id] = tx.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join('?')).toMatch(
      /role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE/u,
    );
    expect(id).toBe(ADMIN_ID);
    expect(tx.specialistApplication.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: 'PENDING_REVIEW' },
      data: { status: 'APPROVED' },
    });
    expect(tx.specialistReview.create).toHaveBeenCalledWith({
      data: {
        applicationId: APP_ID,
        reviewerId: ADMIN_ID,
        decision: 'APPROVED',
        reason: null,
      },
    });
    expect(accounts.notify).toHaveBeenCalledTimes(2);
  });

  it('rejects a suspended/demoted/missing reviewer at the row lock without reading or changing an application', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.review(APP_ID, ADMIN_ID, 'APPROVED')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.specialistApplication.findUnique).not.toHaveBeenCalled();
    expect(tx.specialistReview.create).not.toHaveBeenCalled();
    expect(accounts.notify).not.toHaveBeenCalled();
  });

  it('rejects self-review independently of role routing', async () => {
    tx.specialistApplication.findUnique.mockResolvedValue({
      ...application(),
      userId: ADMIN_ID,
    });
    await expect(service.review(APP_ID, ADMIN_ID, 'APPROVED')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.specialistApplication.updateMany).not.toHaveBeenCalled();
  });

  it('rejects missing applications without an audit mutation', async () => {
    tx.specialistApplication.findUnique.mockResolvedValue(null);
    await expect(service.review(APP_ID, ADMIN_ID, 'APPROVED')).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.specialistReview.create).not.toHaveBeenCalled();
  });

  it('rejects inactive or unverified applicants before decision mutation', async () => {
    for (const applicant of [
      { ...user(), status: 'SUSPENDED' },
      { ...user(), emailVerifiedAt: null },
    ]) {
      tx.specialistApplication.findUnique.mockResolvedValueOnce({
        ...application(),
        user: applicant,
      });
      await expect(
        service.review(APP_ID, ADMIN_ID, 'APPROVED'),
      ).rejects.toThrow(ConflictException);
    }
    expect(tx.specialistApplication.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a lost review race without creating a second audit or sending notifications', async () => {
    tx.specialistApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.review(APP_ID, ADMIN_ID, 'APPROVED')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.specialistReview.create).not.toHaveBeenCalled();
    expect(accounts.notify).not.toHaveBeenCalled();
  });

  it('records a meaningful trimmed rejection reason and sends no activation welcome', async () => {
    await expect(
      service.review(
        APP_ID,
        ADMIN_ID,
        'REJECTED',
        '  Synthetic qualification needs clarification  ',
      ),
    ).resolves.toEqual({ message: 'Application rejected' });
    expect(tx.specialistReview.create).toHaveBeenCalledWith({
      data: {
        applicationId: APP_ID,
        reviewerId: ADMIN_ID,
        decision: 'REJECTED',
        reason: 'Synthetic qualification needs clarification',
      },
    });
    expect(accounts.notify).toHaveBeenCalledTimes(1);
    expect(accounts.notify).toHaveBeenCalledWith(
      expect.any(Object),
      'specialist-rejected',
      `review:${APP_ID}`,
      'https://natiq.example/application-status',
    );
  });

  it('rejects missing/short/overlong rejection reasons before opening a transaction', async () => {
    for (const reason of [undefined, '', 'short', 'x'.repeat(1001)]) {
      await expect(
        service.review(APP_ID, ADMIN_ID, 'REJECTED', reason),
      ).rejects.toThrow(BadRequestException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('associates uploaded bytes conditionally and reports an upload race without retrying or deleting', async () => {
    prisma.specialistApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.upload(USER_ID, PDF)).rejects.toThrow(
      'changed during upload',
    );
    expect(documents.upload).toHaveBeenCalledTimes(1);
    expect(prisma.specialistApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: APP_ID,
        status: 'DRAFT',
        documentKey: null,
        user: { status: 'ACTIVE', role: 'SPECIALIST' },
      },
      data: {
        documentKey: `${USER_ID}/synthetic.pdf`,
        documentSize: PDF.length,
        documentSha256: 'synthetic-digest',
      },
    });
  });

  it('requires a verified active specialist and persisted PDF in the atomic submission predicate', async () => {
    tx.specialistApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit(USER_ID)).rejects.toThrow(ConflictException);
    expect(tx.specialistApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: APP_ID,
        status: 'DRAFT',
        submittedAt: null,
        documentKey: { not: null },
        user: {
          status: 'ACTIVE',
          role: 'SPECIALIST',
        },
      },
      data: { submittedAt: expect.any(Date) },
    });
    expect(accounts.notify).not.toHaveBeenCalled();
  });

  it('rejects parent or suspended specialist uploads before external storage', async () => {
    for (const applicant of [
      { ...user(), role: 'PARENT' },
      { ...user(), status: 'SUSPENDED' },
    ]) {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...applicant,
        specialistApplication: application(),
      });
      await expect(service.upload(USER_ID, PDF)).rejects.toThrow(
        ForbiddenException,
      );
    }
    expect(documents.upload).not.toHaveBeenCalled();
  });

  it('hides documents from nonowners and uses only the database-owned key for authorized downloads', async () => {
    prisma.specialistApplication.findUnique.mockResolvedValue({
      userId: USER_ID,
      documentKey: 'private-owned-reference',
    });
    await expect(service.document(APP_ID, ADMIN_ID, false)).rejects.toThrow(
      NotFoundException,
    );
    expect(documents.download).not.toHaveBeenCalled();
    await expect(service.document(APP_ID, USER_ID, false)).resolves.toEqual(
      PDF,
    );
    expect(documents.download).toHaveBeenCalledWith('private-owned-reference');
  });
});
