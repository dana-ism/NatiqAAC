import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { compare } from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createFirstAdmin } from '../src/admin/bootstrap';
import { isolatedTestEnvironment } from './test-environment';

const isolated = isolatedTestEnvironment(process.env);
describe('First Admin on isolated PostgreSQL', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolated.databaseUrl }),
  });
  const ids: string[] = [];
  const emails = [randomUUID() + '@example.com', randomUUID() + '@example.com'];
  const details = (email: string) => ({
    fullName: ' Synthetic Admin ',
    email,
    password: 'SyntheticPass123!',
  });
  beforeAll(async () => {
    await prisma.$connect();
    if (await prisma.user.count({ where: { role: 'ADMIN' } }))
      throw new Error(
        'Isolated database already has Admin; refuse to alter existing records',
      );
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: ids } }, { email: { in: emails } }] },
    });
    ids.length = 0;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('runs the manual command on isolated data without printing credentials', async () => {
    const output = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['dist/admin/bootstrap-command.js'],
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            NATIQ_ADMIN_BOOTSTRAP: 'CREATE_FIRST_ADMIN',
            ADMIN_BOOTSTRAP_DATABASE_URL: isolated.databaseUrl,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(JSON.stringify(details(emails[0])));
    });
    expect(output).toEqual({
      code: 0,
      stdout: 'Initial administrator created.\n',
      stderr: '',
    });
    expect(
      await prisma.user.count({ where: { role: 'ADMIN', email: emails[0] } }),
    ).toBe(1);
  });
  it('creates a hashed active Admin once and refuses a second run even for a suspended Admin', async () => {
    const created = await createFirstAdmin(prisma, details(emails[0]));
    ids.push(created.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(user).toMatchObject({
      role: 'ADMIN',
      status: 'ACTIVE',
      fullName: 'Synthetic Admin',
    });
    expect(user.passwordHash).not.toBe(details(emails[0]).password);
    expect(await compare(details(emails[0]).password, user.passwordHash!)).toBe(
      true,
    );
    await prisma.user.update({
      where: { id: created.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(createFirstAdmin(prisma, details(emails[1]))).rejects.toThrow(
      'administrator already exists',
    );
  });
  it('serializes simultaneous executions so only one can create the initial Admin', async () => {
    const results = await Promise.allSettled(
      emails.map((email) => createFirstAdmin(prisma, details(email))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.user.count({
        where: { role: 'ADMIN', email: { in: emails } },
      }),
    ).toBe(1);
  });
  it('never promotes or overwrites an existing mixed-case Parent identity', async () => {
    const parent = await prisma.user.create({
      data: {
        fullName: 'Synthetic Parent',
        email: emails[0].toUpperCase(),
        passwordHash: 'synthetic-unused-hash',
      },
    });
    ids.push(parent.id);
    await expect(createFirstAdmin(prisma, details(emails[0]))).rejects.toThrow(
      'account already uses this email',
    );
    expect(await prisma.user.findUnique({ where: { id: parent.id } })).toEqual(
      parent,
    );
  });
});
