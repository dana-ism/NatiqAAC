import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { hash } from 'bcrypt';
import { RegisterDto } from '../auth/dto/register.dto';
import type { PrismaClient } from '../generated/prisma/client';

export function bootstrapDatabaseUrl(env: NodeJS.ProcessEnv): string {
  // Deliberately independent of DATABASE_URL, DIRECT_URL and dotenv.
  // Remote/production bootstrap needs a separately reviewed operational procedure.
  if (
    env.NATIQ_ADMIN_BOOTSTRAP !== 'CREATE_FIRST_ADMIN' ||
    !['development', 'test'].includes(env.NODE_ENV || '')
  )
    throw new Error('Explicit local bootstrap authorization is required');
  const url = new URL(env.ADMIN_BOOTSTRAP_DATABASE_URL || '');
  if (
    url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Only an explicitly selected local PostgreSQL database is allowed',
    );
  return url.toString();
}

export async function createFirstAdmin(prisma: PrismaClient, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid administrator details');
  }
  const dto = plainToInstance(RegisterDto, input);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length || Buffer.byteLength(dto.password, 'utf8') > 72) {
    throw new Error('Invalid administrator details');
  }
  const passwordHash = await hash(dto.password, 12);
  return prisma.$transaction(
    async (tx) => {
      // Shared transaction lock serializes all executions, including an empty table.
      // READ COMMITTED gives the second caller a fresh snapshot after acquiring it.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(724611803::bigint)::text`;
      if (await tx.user.count({ where: { role: 'ADMIN' } })) {
        throw new Error('An administrator already exists; bootstrap refused');
      }
      if (
        await tx.user.findFirst({
          where: { email: { equals: dto.email, mode: 'insensitive' } },
          select: { id: true },
        })
      )
        throw new Error(
          'An account already uses this email; bootstrap refused',
        );
      return tx.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
