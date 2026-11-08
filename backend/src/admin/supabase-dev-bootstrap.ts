import { X509Certificate } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';

export const SUPABASE_DEV_ACK = 'CREATE_FIRST_ADMIN_IN_DEVELOPMENT';

// A separate operator-only policy; the local bootstrap policy is unchanged.
export function supabaseDevelopmentTarget(env: NodeJS.ProcessEnv, ca: string) {
  const projectRef = env.NATIQ_SUPABASE_DEV_PROJECT_REF || '';
  if (
    env.NODE_ENV !== 'development' ||
    env.NATIQ_SUPABASE_DEV_BOOTSTRAP !== SUPABASE_DEV_ACK ||
    !/^[a-z0-9]{20}$/.test(projectRef) ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  )
    throw new Error('TARGET_NOT_AUTHORIZED');
  const certificate = new X509Certificate(ca);
  if (
    !certificate.ca ||
    Date.now() < Date.parse(certificate.validFrom) ||
    Date.now() >= Date.parse(certificate.validTo)
  )
    throw new Error('CA_NOT_VALID');
  function identify(value: string | undefined, session: boolean) {
    const url = new URL(value || '');
    const direct = url.hostname === `db.${projectRef}.supabase.co`;
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
    if (
      url.protocol !== 'postgresql:' ||
      url.pathname !== '/postgres' ||
      !url.password ||
      url.hash ||
      !(direct || pooler) ||
      decodeURIComponent(url.username) !==
        (direct ? 'postgres' : `postgres.${projectRef}`) ||
      (session ? url.port !== '5432' : !['5432', '6543'].includes(url.port))
    )
      throw new Error('TARGET_MISMATCH');
    // SSL URL options can override node-postgres's explicit certificate policy.
    // Session/migration URL must be unambiguous; normal runtime may use pgbouncer.
    for (const [key, value] of url.searchParams) {
      if (session || key !== 'pgbouncer' || value !== 'true')
        throw new Error('UNSUPPORTED_URL_OPTIONS');
    }
    return url.toString();
  }
  const connectionString = identify(env.DIRECT_URL, true);
  identify(env.DATABASE_URL, false);
  return {
    projectRef,
    connectionString,
    ssl: { ca, rejectUnauthorized: true as const },
  };
}

export async function verifySupabaseBootstrapSchema(
  prisma: PrismaClient,
  checksum: string,
) {
  const rows = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      checksum: string;
      finished: boolean;
      rolled_back: boolean;
    }>
  >`SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations`;
  if (
    rows.length !== 1 ||
    rows[0].migration_name !== '20261024113332_init_users' ||
    rows[0].checksum !== checksum ||
    !rows[0].finished ||
    rows[0].rolled_back
  ) {
    throw new Error('SCHEMA_REVIEW_REQUIRED');
  }
  if (await prisma.user.count({ where: { role: 'ADMIN' } }))
    throw new Error('ADMIN_ALREADY_EXISTS');
}

// Use the normal login and protected endpoints; retain credentials/token in memory.
// Successful identity matching proves the running backend sees the created row.
export async function verifyAdminLogin(
  port: string,
  credentials: { email: string; password: string },
  administratorId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('INVALID_LOCAL_API_PORT');
  const base = `http://127.0.0.1:${port}`;
  const login = await fetcher(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (login.status !== 200) return false;
  const result = (await login.json()) as { access_token?: unknown };
  if (typeof result.access_token !== 'string') return false;
  const options = {
    headers: { Authorization: `Bearer ${result.access_token}` },
    signal: AbortSignal.timeout(15000),
    redirect: 'error' as const,
  };
  const me = await fetcher(base + '/auth/me', options);
  if (me.status !== 200) return false;
  const identity = (await me.json()) as {
    userId?: string;
    email?: string;
    role?: string;
  };
  if (
    identity.userId !== administratorId ||
    identity.email?.toLowerCase() !== credentials.email ||
    identity.role !== 'ADMIN'
  )
    return false;
  const overview = await fetcher(base + '/admin/overview', {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  if (overview.status !== 200) return false;
  const data = (await overview.json()) as {
    account?: { email?: string; role?: string };
  };
  return (
    data.account?.email?.toLowerCase() === credentials.email &&
    data.account?.role === 'ADMIN'
  );
}
