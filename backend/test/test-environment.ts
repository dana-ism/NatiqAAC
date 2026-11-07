// Validation is pure and runs before importing/constructing real infrastructure.
export function isolatedTestEnvironment(env: NodeJS.ProcessEnv) {
  const fail = (): never => {
    throw new Error(
      'BLOCKED: explicit isolated localhost test infrastructure is required; see docs/authentication.md',
    );
  };
  if (env.NATIQ_TEST_ISOLATED !== 'YES') fail();
  const parse = (value: string | undefined) => {
    if (!value) return fail();
    try {
      return new URL(value);
    } catch {
      return fail();
    }
  };
  const db = parse(env.TEST_DATABASE_URL);
  const redis = parse(env.TEST_REDIS_URL);
  const local = (url: URL) => ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (
    !local(db) ||
    db.protocol !== 'postgresql:' ||
    db.port !== '55432' ||
    db.pathname !== '/natiqaac_auth_test' ||
    db.username !== 'natiqaac_test' ||
    !db.password ||
    db.search ||
    db.hash
  )
    fail();
  if (
    !local(redis) ||
    redis.protocol !== 'redis:' ||
    redis.port !== '56379' ||
    !['', '/', '/0'].includes(redis.pathname) ||
    redis.username ||
    redis.password ||
    redis.search ||
    redis.hash
  )
    fail();
  return { databaseUrl: db.toString(), redisUrl: redis.toString() };
}
