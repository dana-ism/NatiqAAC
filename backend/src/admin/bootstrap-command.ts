import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { bootstrapDatabaseUrl, createFirstAdmin } from './bootstrap';

async function main() {
  const databaseUrl = bootstrapDatabaseUrl(process.env);
  if (process.argv.length !== 2 || process.stdin.isTTY) {
    throw new Error('Use the documented secure stdin procedure');
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input) > 8192) throw new Error('Input too large');
  }
  const details: unknown = JSON.parse(input);
  input = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    }),
  });
  try {
    await createFirstAdmin(prisma, details);
    process.stdout.write('Initial administrator created.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  // Never print caught errors: drivers/validation can contain credentials or input.
  process.stderr.write(
    'Bootstrap refused or failed. Check local target, input rules, database availability and existing accounts. No account was promoted.\n',
  );
  process.exitCode = 1;
});
