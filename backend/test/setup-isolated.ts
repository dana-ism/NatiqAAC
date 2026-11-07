import { randomBytes } from 'node:crypto';
import { isolatedTestEnvironment } from './test-environment';

const isolated = isolatedTestEnvironment(process.env);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = isolated.databaseUrl;
process.env.DIRECT_URL = isolated.databaseUrl;
process.env.REDIS_URL = isolated.redisUrl;
process.env.JWT_SECRET = randomBytes(32).toString('hex');
