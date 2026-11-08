import { bootstrapDatabaseUrl, createFirstAdmin } from './bootstrap';
import type { PrismaClient } from '../generated/prisma/client';

describe('Bootstrap input and target boundaries', () => {
  const target = {
    NODE_ENV: 'test',
    NATIQ_ADMIN_BOOTSTRAP: 'CREATE_FIRST_ADMIN',
    ADMIN_BOOTSTRAP_DATABASE_URL:
      'postgresql://synthetic:synthetic@127.0.0.1:55432/test',
  };
  it('requires an explicitly authorized local target and never falls back to runtime URLs', () => {
    expect(bootstrapDatabaseUrl(target)).toContain('127.0.0.1');
    for (const env of [
      {},
      { ...target, NODE_ENV: 'production' },
      { ...target, NATIQ_ADMIN_BOOTSTRAP: '' },
      {
        ...target,
        ADMIN_BOOTSTRAP_DATABASE_URL:
          'postgresql://synthetic:synthetic@db.supabase.com/test',
      },
      {
        ...target,
        ADMIN_BOOTSTRAP_DATABASE_URL: '',
        DATABASE_URL: target.ADMIN_BOOTSTRAP_DATABASE_URL,
      },
    ]) {
      expect(() => bootstrapDatabaseUrl(env)).toThrow();
    }
  });
  it.each([
    null,
    [],
    {},
    { fullName: 'A', email: 'bad', password: 'testpassword' },
    { fullName: 'A', email: 'test@example.com', password: 'ع'.repeat(37) },
    {
      fullName: 'A',
      email: 'test@example.com',
      password: 'testpassword',
      role: 'ADMIN',
    },
  ])(
    'rejects invalid credentials before opening a transaction',
    async (details) => {
      const transaction = jest.fn();
      await expect(
        createFirstAdmin(
          { $transaction: transaction } as unknown as PrismaClient,
          details,
        ),
      ).rejects.toThrow('Invalid administrator details');
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
