import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import { OAuthFlowService, type OAuthStart } from './oauth-flow.service';
import { OAuthProviderService } from './oauth-provider.service';

const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const identity = {
  provider: 'GOOGLE' as const,
  subject: 'synthetic-subject',
  fullName: 'Synthetic Parent',
  email: 'parent@example.org',
  emailTrusted: false,
};
describe('OAuthFlowService', () => {
  let service: OAuthFlowService;
  let records: Map<string, { raw: string; expires: number }>;
  let redis: { isReady: boolean; set: jest.Mock; eval: jest.Mock };
  let providers: { createAuthorization: jest.Mock; exchange: jest.Mock };
  const dto: OAuthStart = {
    provider: 'GOOGLE',
    intent: 'register',
    role: 'PARENT',
    challenge,
  };
  beforeEach(() => {
    records = new Map();
    redis = {
      isReady: true,
      set: jest.fn(
        async (
          key: string,
          raw: string,
          options: { EX: number; NX: boolean },
        ) => {
          if (records.has(key)) return null;
          records.set(key, { raw, expires: Date.now() + options.EX * 1000 });
          return 'OK';
        },
      ),
      eval: jest.fn(
        async (
          _script: string,
          options: { keys: string[]; arguments: string[] },
        ) => {
          const stored = records.get(options.keys[0]);
          if (!stored || stored.expires <= Date.now()) return null;
          const value = JSON.parse(stored.raw) as Record<string, unknown>;
          if (value[options.arguments[0]] !== options.arguments[1]) return null;
          records.delete(options.keys[0]);
          return stored.raw;
        },
      ),
    };
    providers = {
      createAuthorization: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/authorization'),
      exchange: jest.fn().mockResolvedValue(identity),
    };
    service = new OAuthFlowService(
      redis as unknown as RedisClientType,
      providers as unknown as OAuthProviderService,
    );
  });
  async function begin(input: OAuthStart = dto) {
    const result = await service.start(input);
    const parameters = providers.createAuthorization.mock.calls.at(-1)?.[1] as {
      state: string;
      nonce: string;
      codeVerifier: string;
      codeChallenge: string;
    };
    return { result, ...parameters };
  }
  it('generates opaque state, nonce and PKCE and stores a bounded explicit transaction', async () => {
    const start = await begin({
      ...dto,
      injectedUserId: 'never-trusted',
    } as OAuthStart);
    expect(start.result).toEqual({
      authorizationUrl: 'https://accounts.google.com/authorization',
    });
    expect(new Set([start.state, start.nonce, start.codeVerifier]).size).toBe(
      3,
    );
    expect(start.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(start.codeChallenge).toBe(
      createHash('sha256').update(start.codeVerifier).digest('base64url'),
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:oauth:state:/),
      expect.any(String),
      { EX: 600, NX: true },
    );
    const raw = redis.set.mock.calls[0][1] as string;
    expect(raw).not.toContain('injectedUserId');
    expect(redis.set.mock.calls[0][0]).not.toContain(start.state);
  });
  it.each([
    { ...dto, provider: 'UNKNOWN' },
    { ...dto, role: 'ADMIN' },
    { ...dto, role: undefined },
    { ...dto, intent: 'link' },
    { ...dto, intent: 'login' },
    { ...dto, challenge: 'short' },
  ])('rejects unapproved or malformed start %j', async (input) => {
    await expect(service.start(input as OAuthStart)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('does not store a transaction for an unavailable provider', async () => {
    providers.createAuthorization.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });
    await expect(service.start(dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('finishes only after browser verifier proof and returns no secret transaction fields', async () => {
    const start = await begin();
    const id = await service.callback('GOOGLE', 'synthetic-code', start.state);
    expect(providers.exchange).toHaveBeenCalledWith(
      'GOOGLE',
      'synthetic-code',
      { nonce: start.nonce, codeVerifier: start.codeVerifier },
    );
    expect(redis.set.mock.calls[1][2]).toEqual({ EX: 120, NX: true });
    expect(await service.finish(id, verifier)).toEqual({
      identity,
      intent: 'register',
      role: 'PARENT',
    });
    await expect(service.finish(id, verifier)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('rejects a mismatching provider without consuming another provider state', async () => {
    const start = await begin();
    await expect(
      service.callback('FACEBOOK', 'code', start.state),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(providers.exchange).not.toHaveBeenCalled();
    await expect(
      service.callback('GOOGLE', 'code', start.state),
    ).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('does not consume completion for an incorrect browser verifier', async () => {
    const start = await begin();
    const id = await service.callback('GOOGLE', 'code', start.state);
    await expect(service.finish(id, 'x'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.finish(id, verifier)).resolves.toMatchObject({
      identity,
    });
  });
  it('permits exactly one concurrent callback and finish', async () => {
    const start = await begin();
    const callbacks = await Promise.allSettled([
      service.callback('GOOGLE', 'code', start.state),
      service.callback('GOOGLE', 'code', start.state),
    ]);
    expect(
      callbacks.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(providers.exchange).toHaveBeenCalledTimes(1);
    const success = callbacks.find(
      (value) => value.status === 'fulfilled',
    ) as PromiseFulfilledResult<string>;
    const completions = await Promise.allSettled([
      service.finish(success.value, verifier),
      service.finish(success.value, verifier),
    ]);
    expect(
      completions.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1);
  });
  it('rejects expired transactions and completions', async () => {
    const start = await begin();
    for (const value of records.values()) value.expires = 0;
    await expect(
      service.callback('GOOGLE', 'code', start.state),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(providers.exchange).not.toHaveBeenCalled();
    records.clear();
    const next = await begin();
    const id = await service.callback('GOOGLE', 'code', next.state);
    for (const value of records.values()) value.expires = 0;
    await expect(service.finish(id, verifier)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('fails closed when required Redis is unavailable', async () => {
    redis.isReady = false;
    await expect(service.start(dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('supports existing login without assigning a public registration role', async () => {
    const start = await begin({
      provider: 'GOOGLE',
      intent: 'login',
      challenge,
    });
    const id = await service.callback('GOOGLE', 'code', start.state);
    expect(await service.finish(id, verifier)).toEqual({
      identity,
      intent: 'login',
    });
  });
  it('carries authenticated linking context only through an internal start method', async () => {
    const userId = 'b3e66354-7fa7-4597-9246-6e9ca674c99b';
    await service.startLink('GOOGLE', challenge, userId);
    const state = providers.createAuthorization.mock.calls[0][1]
      .state as string;
    const id = await service.callback('GOOGLE', 'code', state);
    expect(await service.finish(id, verifier)).toEqual({
      identity,
      intent: 'link',
      linkUserId: userId,
    });
  });
  it('never imports public login linking context fields', async () => {
    const start = await begin({
      provider: 'GOOGLE',
      intent: 'login',
      challenge,
      linkUserId: 'b3e66354-7fa7-4597-9246-6e9ca674c99b',
    } as OAuthStart);
    const id = await service.callback('GOOGLE', 'code', start.state);
    expect(await service.finish(id, verifier)).toEqual({
      identity,
      intent: 'login',
    });
  });
  it('consumes failed provider callbacks without issuing a completion', async () => {
    const start = await begin();
    providers.exchange.mockRejectedValue(new UnauthorizedException());
    await expect(
      service.callback('GOOGLE', 'code', start.state),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.set).toHaveBeenCalledTimes(1);
    await expect(
      service.callback('GOOGLE', 'code', start.state),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects provider identity substitution', async () => {
    const start = await begin();
    providers.exchange.mockResolvedValue({ ...identity, provider: 'FACEBOOK' });
    await expect(
      service.callback('GOOGLE', 'code', start.state),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects malformed or persistent state returned by Redis', async () => {
    redis.eval.mockResolvedValueOnce('{broken');
    await expect(
      service.callback('GOOGLE', 'code', 's'.repeat(43)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    redis.eval.mockResolvedValueOnce(1);
    await expect(
      service.finish('i'.repeat(43), verifier),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
