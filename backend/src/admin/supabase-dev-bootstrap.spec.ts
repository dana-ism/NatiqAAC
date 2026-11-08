import type { PrismaClient } from '../generated/prisma/client';
import {
  SUPABASE_DEV_ACK,
  supabaseDevelopmentTarget,
  verifyAdminLogin,
  verifySupabaseBootstrapSchema,
} from './supabase-dev-bootstrap';

// Unit tests substitute certificate parsing only. Actual verified TLS is checked
// separately against the approved development target, without creating accounts.
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  X509Certificate: jest.fn().mockImplementation((value: string) => {
    if (value === 'invalid') throw new Error('invalid certificate');
    return {
      ca: value !== 'leaf',
      validFrom: '2020-01-01',
      validTo: value === 'expired' ? '2020-01-02' : '2100-01-01',
    };
  }),
}));
const ref = 'a'.repeat(20);
const pooler = 'aws-0-eu-central-1.pooler.supabase.com';
const direct = `postgresql://postgres.${ref}:synthetic@${pooler}:5432/postgres`;
const runtime = `postgresql://postgres.${ref}:synthetic@${pooler}:6543/postgres?pgbouncer=true`;
const env = {
  NODE_ENV: 'development',
  NATIQ_SUPABASE_DEV_BOOTSTRAP: SUPABASE_DEV_ACK,
  NATIQ_SUPABASE_DEV_PROJECT_REF: ref,
  DIRECT_URL: direct,
  DATABASE_URL: runtime,
};

describe('Explicit Supabase development policy', () => {
  it('pins both URLs to the authorized project and requires verified TLS', () => {
    expect(supabaseDevelopmentTarget(env, 'test-ca')).toEqual({
      projectRef: ref,
      connectionString: direct,
      ssl: { ca: 'test-ca', rejectUnauthorized: true },
    });
    expect(
      supabaseDevelopmentTarget(
        {
          ...env,
          DIRECT_URL: `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres`,
        },
        'test-ca',
      ).projectRef,
    ).toBe(ref);
  });
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { NATIQ_SUPABASE_DEV_BOOTSTRAP: '' },
    { NATIQ_SUPABASE_DEV_PROJECT_REF: '' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { DIRECT_URL: runtime },
    { DIRECT_URL: direct + '?sslmode=no-verify' },
    { DIRECT_URL: direct.replace(pooler, 'attacker.example.com') },
    { DATABASE_URL: runtime.replace(ref, 'b'.repeat(20)) },
    { DIRECT_URL: direct.replace('/postgres', '/other') },
    { DIRECT_URL: direct.replace(':synthetic@', '@') },
    { DIRECT_URL: direct.replace('postgresql:', 'http:') },
  ])('refuses unsafe or inconsistent target configuration', (override) => {
    expect(() =>
      supabaseDevelopmentTarget({ ...env, ...override }, 'test-ca'),
    ).toThrow();
  });
  it.each(['invalid', 'leaf', 'expired'])(
    'rejects unusable CA material',
    (ca) => {
      expect(() => supabaseDevelopmentTarget(env, ca)).toThrow();
    },
  );
});

describe('Read-only remote preflight', () => {
  const migration = {
    migration_name: '20261024113332_init_users',
    checksum: 'test-checksum',
    finished: true,
    rolled_back: false,
  };
  const prisma = (rows: unknown[], admins = 0) =>
    ({
      $queryRaw: jest.fn().mockResolvedValue(rows),
      user: { count: jest.fn().mockResolvedValue(admins) },
    }) as unknown as PrismaClient;
  it('accepts the exact applied migration and no existing Admin', async () => {
    await expect(
      verifySupabaseBootstrapSchema(prisma([migration]), 'test-checksum'),
    ).resolves.toBeUndefined();
  });
  it.each(
    [
      [],
      [{ ...migration, finished: false }],
      [{ ...migration, rolled_back: true }],
      [{ ...migration, checksum: 'other' }],
      [migration, migration],
    ].map((rows) => ({ rows })),
  )(
    'refuses missing, failed, changed or unexpected migrations',
    async ({ rows }) => {
      await expect(
        verifySupabaseBootstrapSchema(prisma(rows), 'test-checksum'),
      ).rejects.toThrow('SCHEMA_REVIEW_REQUIRED');
    },
  );
  it('refuses any preexisting Admin', async () => {
    await expect(
      verifySupabaseBootstrapSchema(prisma([migration], 1), 'test-checksum'),
    ).rejects.toThrow('ADMIN_ALREADY_EXISTS');
  });
});

describe('Normal backend login verification without logging secrets', () => {
  const credentials = {
    email: 'synthetic@example.com',
    password: 'synthetic-test-password',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  it('checks the exact created identity and protected Admin overview through loopback only', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'synthetic-token' }))
      .mockResolvedValueOnce(
        json({
          userId: 'synthetic-id',
          email: credentials.email,
          role: 'ADMIN',
        }),
      )
      .mockResolvedValueOnce(
        json({ account: { email: credentials.email, role: 'ADMIN' } }),
      );
    expect(
      await verifyAdminLogin('3000', credentials, 'synthetic-id', fetcher),
    ).toBe(true);
    expect(fetcher.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'http://127.0.0.1:3000/auth/login',
      'http://127.0.0.1:3000/auth/me',
      'http://127.0.0.1:3000/admin/overview',
    ]);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer synthetic-token',
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('rejects invalid ports before sending credentials', async () => {
    const fetcher = jest.fn();
    await expect(
      verifyAdminLogin('https://other.example', credentials, 'id', fetcher),
    ).rejects.toThrow('INVALID_LOCAL_API_PORT');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not accept a token if the backend sees a different account or role', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'synthetic-token' }))
      .mockResolvedValueOnce(
        json({ userId: 'different', email: credentials.email, role: 'PARENT' }),
      );
    expect(
      await verifyAdminLogin('3000', credentials, 'synthetic-id', fetcher),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reports a rejected login without further calls', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(json({}, 401));
    expect(
      await verifyAdminLogin('3000', credentials, 'synthetic-id', fetcher),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
