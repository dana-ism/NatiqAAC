import { defineConfig } from 'prisma/config';
import { isolatedTestEnvironment } from './test/test-environment';

// No dotenv import, no default connection URLs, no reset or automatic execution.
const test = isolatedTestEnvironment(process.env);
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: test.databaseUrl },
});
