import { isolatedTestEnvironment } from './test-environment';

const safe = {
  NATIQ_TEST_ISOLATED: 'YES',
  TEST_DATABASE_URL:
    'postgresql://natiqaac_test:synthetic-only@127.0.0.1:55432/natiqaac_auth_test',
  TEST_REDIS_URL: 'redis://127.0.0.1:56379/0',
};
describe('test isolation before any connections', () => {
  it('accepts explicit dedicated localhost settings', () => {
    expect(isolatedTestEnvironment(safe).redisUrl).toBe(safe.TEST_REDIS_URL);
  });
  it.each([
    {},
    { DATABASE_URL: safe.TEST_DATABASE_URL, REDIS_URL: safe.TEST_REDIS_URL },
    { ...safe, NATIQ_TEST_ISOLATED: '' },
    {
      ...safe,
      TEST_DATABASE_URL:
        'postgresql://user:private@db.example.com:55432/natiqaac_auth_test',
    },
    {
      ...safe,
      TEST_DATABASE_URL: safe.TEST_DATABASE_URL.replace('55432', '5432'),
    },
    {
      ...safe,
      TEST_DATABASE_URL: safe.TEST_DATABASE_URL.replace(
        '/natiqaac_auth_test',
        '/postgres',
      ),
    },
    {
      ...safe,
      TEST_DATABASE_URL: safe.TEST_DATABASE_URL + '?host=db.example.com',
    },
    { ...safe, TEST_REDIS_URL: 'redis://redis.example.com:56379/0' },
    { ...safe, TEST_REDIS_URL: 'redis://127.0.0.1:6379/0' },
  ])(
    'refuses missing, development and remote settings without leaking URLs',
    (env) => {
      expect(() => isolatedTestEnvironment(env)).toThrow(/^BLOCKED:/);
      try {
        isolatedTestEnvironment(env);
      } catch (error) {
        expect((error as Error).message).not.toMatch(
          /private|postgresql:|redis:/,
        );
      }
    },
  );
});
