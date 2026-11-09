import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmailDomainService } from './email-domain.service';

const dnsError = (code: string) =>
  Object.assign(new Error('private DNS details'), { code });

describe('EmailDomainService registration boundary', () => {
  const resolver = {
    resolveMx: jest.fn(),
    resolve4: jest.fn(),
    resolve6: jest.fn(),
    cancel: jest.fn(),
  };
  const resolverFactory = jest.fn(() => resolver);
  let service: EmailDomainService;

  beforeEach(() => {
    jest.resetAllMocks();
    resolverFactory.mockReturnValue(resolver);
    resolver.resolveMx.mockResolvedValue([
      { priority: 10, exchange: 'mx.provider.ps' },
    ]);
    resolver.resolve4.mockRejectedValue(dnsError('ENODATA'));
    resolver.resolve6.mockRejectedValue(dnsError('ENODATA'));
    service = new EmailDomainService({ resolverFactory });
  });
  afterEach(() => jest.useRealTimers());

  it('accepts uncommon university/business/Palestinian domains without a provider whitelist', async () => {
    for (const domain of [
      'university.edu.ps',
      'new-business.solutions',
      'institution.ps',
    ]) {
      await expect(
        service.validateForRegistration(` Person.Name+AAC@${domain} `),
      ).resolves.toBe(`person.name+aac@${domain}`);
      expect(resolver.resolveMx).toHaveBeenLastCalledWith(domain);
    }
  });

  it.each([
    'missing-at',
    'person@@institution.ps',
    'person@-bad.ps',
    'person@bad_.ps',
    'person@bad..ps',
    'person@bad.ps.',
    'person@localhost',
    'person@127.0.0.1',
    'person@[::1]',
    'person@institution.test',
    'person@a.example.com',
    'person@example.org',
    'person@a.local',
    'person@a.internal',
    'person@a.onion',
    'person@home.arpa',
    'person@bad.invalid',
    'person@a.example',
    'person\r\n@institution.ps',
    `person@${'a'.repeat(64)}.ps`,
    `${'a'.repeat(65)}@institution.ps`,
  ])('rejects malformed/reserved identity %s without DNS', async (email) => {
    await expect(service.validateForRegistration(email)).rejects.toThrow(
      BadRequestException,
    );
    expect(resolverFactory).not.toHaveBeenCalled();
  });

  it('rejects excessively long input', async () => {
    const email = `${'a'.repeat(64)}@${['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(60), 'com'].join('.')}`;
    await expect(service.validateForRegistration(email)).rejects.toThrow(
      BadRequestException,
    );
    expect(resolverFactory).not.toHaveBeenCalled();
  });

  it.each(['mailinator.com', 'sub.mailinator.com', 'yopmail.com'])(
    'blocks reviewed disposable provider %s',
    async (domain) => {
      await expect(
        service.validateForRegistration(`person@${domain}`),
      ).rejects.toThrow('permanent email');
      expect(resolverFactory).not.toHaveBeenCalled();
    },
  );

  it('matches disposable boundaries without blocking lookalikes', async () => {
    await expect(
      service.validateForRegistration('person@notmailinator.com'),
    ).resolves.toBe('person@notmailinator.com');
  });

  it('supports additional reviewed disposable entries without replacing the seed', async () => {
    service = new EmailDomainService({
      resolverFactory,
      disposableDomains: ['Reviewed-Disposable.solutions'],
    });
    await expect(
      service.validateForRegistration(
        'person@child.reviewed-disposable.solutions',
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateForRegistration('person@mailinator.com'),
    ).rejects.toThrow(BadRequestException);
    expect(resolverFactory).not.toHaveBeenCalled();
  });

  it('uses ASCII DNS labels for internationalized domains', async () => {
    await expect(
      service.validateForRegistration('person@bücher.de'),
    ).resolves.toBe('person@bücher.de');
    expect(resolver.resolveMx).toHaveBeenCalledWith('xn--bcher-kva.de');
  });

  it.each(['', '.'])(
    'rejects explicit null MX (%s) without A/AAAA fallback',
    async (exchange) => {
      resolver.resolveMx.mockResolvedValue([{ priority: 0, exchange }]);
      await expect(
        service.validateForRegistration('person@institution.ps'),
      ).rejects.toThrow(BadRequestException);
      expect(resolver.resolve4).not.toHaveBeenCalled();
    },
  );

  it.each(['A', 'AAAA'])(
    'allows RFC implicit MX using %s when no MX data',
    async (type) => {
      resolver.resolveMx.mockRejectedValue(dnsError('ENODATA'));
      (type === 'A' ? resolver.resolve4 : resolver.resolve6).mockResolvedValue([
        'synthetic-address',
      ]);
      await expect(
        service.validateForRegistration('person@institution.ps'),
      ).resolves.toBe('person@institution.ps');
    },
  );

  it('does not apply implicit MX fallback to an NXDOMAIN response', async () => {
    resolver.resolveMx.mockRejectedValue(dnsError('ENOTFOUND'));
    await expect(
      service.validateForRegistration('person@nonexistent.ps'),
    ).rejects.toThrow(BadRequestException);
    expect(resolver.resolve4).not.toHaveBeenCalled();
  });

  it('rejects domains with neither MX nor A/AAAA', async () => {
    resolver.resolveMx.mockResolvedValue([]);
    await expect(
      service.validateForRegistration('person@institution.ps'),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['ETIMEOUT', 'ESERVFAIL', 'EREFUSED', 'ECANCELLED'])(
    'returns sanitized retryable 503 for DNS %s',
    async (code) => {
      resolver.resolveMx.mockRejectedValueOnce(dnsError(code));
      await expect(
        service.validateForRegistration('person@institution.ps'),
      ).rejects.toMatchObject({
        response: {
          statusCode: 503,
          message:
            'Email domain validation is temporarily unavailable; please retry',
        },
      });
      // Temporary verdicts never poison the cache.
      await expect(
        service.validateForRegistration('person@institution.ps'),
      ).resolves.toBe('person@institution.ps');
      expect(resolver.resolveMx).toHaveBeenCalledTimes(2);
    },
  );

  it('preserves retryable A/AAAA failure when neither provides an address', async () => {
    resolver.resolveMx.mockResolvedValue([]);
    resolver.resolve6.mockRejectedValue(dnsError('ESERVFAIL'));
    await expect(
      service.validateForRegistration('person@institution.ps'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('accepts a known A address even when AAAA fails transiently', async () => {
    resolver.resolveMx.mockResolvedValue([]);
    resolver.resolve4.mockResolvedValue(['192.0.2.1']);
    resolver.resolve6.mockRejectedValue(dnsError('ESERVFAIL'));
    await expect(
      service.validateForRegistration('person@institution.ps'),
    ).resolves.toBe('person@institution.ps');
  });

  it('bounds the entire lookup, cancels outstanding DNS, and permits retry', async () => {
    jest.useFakeTimers();
    resolver.resolveMx.mockImplementationOnce(() => new Promise(() => {}));
    const result = service.validateForRegistration('person@institution.ps');
    const rejected = expect(result).rejects.toThrow(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(resolver.cancel).toHaveBeenCalledTimes(1);
    await expect(
      service.validateForRegistration('person@institution.ps'),
    ).resolves.toBe('person@institution.ps');
  });

  it('shares concurrent checks for a domain and caches by domain rather than email', async () => {
    await Promise.all([
      service.validateForRegistration('first@institution.ps'),
      service.validateForRegistration('second@institution.ps'),
    ]);
    await service.validateForRegistration('third@institution.ps');
    expect(resolverFactory).toHaveBeenCalledTimes(1);
  });

  it('expires cached DNS verdicts', async () => {
    jest.useFakeTimers();
    await service.validateForRegistration('person@institution.ps');
    await jest.advanceTimersByTimeAsync(300_001);
    await service.validateForRegistration('person@institution.ps');
    expect(resolverFactory).toHaveBeenCalledTimes(2);
  });

  it('caches authoritative invalid-domain verdicts too', async () => {
    resolver.resolveMx.mockRejectedValue(dnsError('ENOTFOUND'));
    await expect(
      service.validateForRegistration('first@institution.ps'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateForRegistration('second@institution.ps'),
    ).rejects.toThrow(BadRequestException);
    expect(resolverFactory).toHaveBeenCalledTimes(1);
  });

  it('evicts oldest verdict when cache reaches its bound', async () => {
    service = new EmailDomainService({ resolverFactory, maxCacheEntries: 2 });
    for (const domain of ['one.ps', 'two.ps', 'three.ps', 'one.ps']) {
      await service.validateForRegistration(`person@${domain}`);
    }
    expect(resolverFactory).toHaveBeenCalledTimes(4);
  });

  it('bounds distinct pending checks without rejecting requests sharing an in-flight domain', async () => {
    service = new EmailDomainService({
      resolverFactory,
      maxConcurrentChecks: 1,
    });
    let resolveMx!: (value: { exchange: string; priority: number }[]) => void;
    resolver.resolveMx.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMx = resolve;
        }),
    );
    const first = service.validateForRegistration('person@one.ps');
    const shared = service.validateForRegistration('other@one.ps');
    await expect(
      service.validateForRegistration('person@two.ps'),
    ).rejects.toThrow(ServiceUnavailableException);
    resolveMx([{ priority: 10, exchange: 'mail.one.ps' }]);
    await expect(first).resolves.toBe('person@one.ps');
    await expect(shared).resolves.toBe('other@one.ps');
    expect(resolverFactory).toHaveBeenCalledTimes(1);
  });

  it('fails startup on invalid limits or malformed reviewed blocklist entries', () => {
    expect(() => new EmailDomainService({ timeoutMs: 0 })).toThrow(
      'positive safe integers',
    );
    expect(
      () => new EmailDomainService({ disposableDomains: ['not a domain'] }),
    ).toThrow('configuration');
  });
});
