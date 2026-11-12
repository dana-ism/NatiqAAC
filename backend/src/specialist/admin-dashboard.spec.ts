import { reviewVisibility, SpecialistService } from './specialist.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorageService } from './document-storage.service';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';

describe('Read-only Admin dashboard', () => {
  const tx = {
    specialistApplication: { groupBy: jest.fn(), findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  let service: SpecialistService;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    tx.specialistApplication.groupBy.mockResolvedValue([]);
    tx.specialistApplication.findMany.mockResolvedValue([]);
    service = new SpecialistService(
      prisma as unknown as PrismaService,
      {} as DocumentStorageService,
      {} as AccountLifecycleService,
    );
  });
  it('returns genuine empty counts without requiring any existing application', async () => {
    await expect(service.dashboard()).resolves.toEqual({
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalCount: 0,
      recentApplications: [],
    });
  });
  it('counts the full dataset, includes drafts in total, and returns only the safe recent projection', async () => {
    tx.specialistApplication.groupBy.mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 4 } },
      { status: 'PENDING_REVIEW', _count: { _all: 140 } },
      { status: 'APPROVED', _count: { _all: 12 } },
      { status: 'REJECTED', _count: { _all: 3 } },
    ]);
    tx.specialistApplication.findMany.mockResolvedValue([
      {
        id: 'synthetic',
        status: 'PENDING_REVIEW',
        user: { fullName: 'Synthetic', email: 'synthetic@example.com' },
      },
    ]);
    const result = await service.dashboard();
    expect(result).toEqual({
      pendingCount: 140,
      approvedCount: 12,
      rejectedCount: 3,
      totalCount: 159,
      recentApplications: [
        {
          id: 'synthetic',
          status: 'PENDING_REVIEW',
          fullName: 'Synthetic',
          email: 'synthetic@example.com',
        },
      ],
    });
    expect(tx.specialistApplication.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: reviewVisibility,
      _count: { _all: true },
    });
    expect(tx.specialistApplication.findMany).toHaveBeenCalledWith({
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
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
  it.each(['groupBy', 'findMany'] as const)(
    'propagates a failed %s instead of fabricating metrics',
    async (method) => {
      tx.specialistApplication[method].mockRejectedValue(
        new Error('Synthetic database unavailable'),
      );
      await expect(service.dashboard()).rejects.toThrow(
        'Synthetic database unavailable',
      );
    },
  );
});
