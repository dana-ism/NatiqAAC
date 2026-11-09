import 'reflect-metadata';
import {
  readFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { parse } from 'dotenv';
import { compare } from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { createFirstAdmin } from './bootstrap';
import {
  supabaseDevelopmentTarget,
  verifyAdminLogin,
  verifySupabaseBootstrapSchema,
} from './supabase-dev-bootstrap';

async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
  if (!checkOnly && (process.argv.length !== 2 || process.stdin.isTTY))
    throw new Error('INVALID_INVOCATION');
  // Only this explicitly authorized development workflow loads the backend config.
  const env = { ...parse(readFileSync(resolve('.env'))), ...process.env };
  const ca = readFileSync(env.NATIQ_SUPABASE_DEV_CA_FILE || '', 'utf8');
  const target = supabaseDevelopmentTarget(env, ca);
  const checksum = createHash('sha256')
    .update(
      readFileSync(
        resolve('prisma/migrations/20261024113332_init_users/migration.sql'),
      ),
    )
    .digest('hex');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: target.connectionString,
      ssl: target.ssl,
      connectionTimeoutMillis: 8000,
      max: 2,
    }),
  });
  let audit: number | undefined;
  let started = false;
  let created = false;
  const record = (event: string, metadata: Record<string, unknown> = {}) => {
    if (audit === undefined) throw new Error('AUDIT_NOT_READY');
    writeSync(
      audit,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        actor: userInfo().username,
        projectRef: target.projectRef,
        event,
        ...metadata,
      }) + '\n',
    );
    fsyncSync(audit);
  };
  try {
    await verifySupabaseBootstrapSchema(prisma, checksum);
    if (checkOnly) {
      process.stdout.write(
        'PREFLIGHT_PASSED: verified development target, schema and absence of Admin. No writes.\n',
      );
      return;
    }
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += String(chunk);
      if (Buffer.byteLength(input) > 8192) throw new Error('INPUT_TOO_LARGE');
    }
    const details: unknown = JSON.parse(input);
    input = '';
    // Exclusive new, ignored local audit file. A writable sink is required BEFORE insertion.
    audit = openSync(
      resolve(`admin-bootstrap-supabase-${randomUUID()}.log`),
      'ax',
      0o600,
    );
    record('BOOTSTRAP_STARTED');
    started = true;
    const admin = await createFirstAdmin(prisma, details);
    created = true;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
      select: { role: true, status: true, passwordHash: true, email: true },
    });
    const password = (details as { password: string }).password;
    const hashVerified =
      !!user.passwordHash &&
      /^\$2[aby]\$12\$/.test(user.passwordHash) &&
      (await compare(password, user.passwordHash));
    const exactlyOneAdmin =
      (await prisma.user.count({ where: { role: 'ADMIN' } })) === 1;
    if (
      user.role !== 'ADMIN' ||
      user.status !== 'ACTIVE' ||
      !hashVerified ||
      !exactlyOneAdmin
    )
      throw new Error('POSTCHECK_FAILED');
    record('ADMIN_CREATED', {
      administratorId: admin.id,
      role: user.role,
      status: user.status,
      passwordHashVerified: true,
      exactlyOneAdmin: true,
    });
    let loginVerified = false;
    try {
      loginVerified = await verifyAdminLogin(
        env.PORT || '3000',
        { email: user.email.toLowerCase(), password },
        admin.id,
      );
    } catch {
      /* Account creation remains successful if the local API is unavailable. */
    }
    record('LOGIN_CHECK', { verified: loginVerified });
    process.stdout.write(
      `ADMIN_CREATED: role=ADMIN status=ACTIVE passwordHashVerified=true loginVerified=${loginVerified}. Safe audit saved locally.\n`,
    );
  } catch {
    if (audit !== undefined) {
      try {
        record(created ? 'POSTCHECK_REQUIRED' : 'REFUSED_OR_OUTCOME_UNKNOWN');
      } catch {
        /* Never expose filesystem/driver errors or secrets. */
      }
    }
    process.stderr.write(
      started
        ? 'Bootstrap stopped. Verify the target read-only before retrying; an account may already have been committed.\n'
        : 'Bootstrap preflight/input refused. Check explicit target, certificate, migration status and existing Admin.\n',
    );
    process.exitCode = 1;
  } finally {
    if (audit !== undefined) closeSync(audit);
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Development bootstrap stopped. Check authorization, target, trusted CA and read-only account state before retrying. No credentials were logged.\n',
  );
  process.exitCode = 1;
});
