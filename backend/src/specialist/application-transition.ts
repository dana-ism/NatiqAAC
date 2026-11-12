import type { Prisma } from '../generated/prisma/client';

/** Caller holds the applicant's user-row lock, shared with verification/submit. */
export async function promoteSubmittedApplication(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const changed = await tx.specialistApplication.updateMany({
    where: {
      userId,
      status: 'DRAFT',
      submittedAt: { not: null },
      documentKey: { not: null },
      user: {
        status: 'ACTIVE',
        role: 'SPECIALIST',
        emailVerifiedAt: { not: null },
      },
    },
    data: { status: 'PENDING_REVIEW' },
  });
  if (!changed.count) return null;
  const app = await tx.specialistApplication.findUniqueOrThrow({
    where: { userId },
    select: { id: true },
  });
  await tx.mailDelivery.upsert({
    where: { eventKey: `application:${app.id}` },
    create: {
      userId,
      eventKey: `application:${app.id}`,
      kind: 'application-received',
    },
    update: {},
  });
  return app.id;
}
