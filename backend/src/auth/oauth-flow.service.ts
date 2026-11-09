import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { RedisToken } from '@nestjs-redis/client';
import { createHash, randomBytes } from 'node:crypto';
import type { RedisClientType } from 'redis';
import { isUUID } from 'class-validator';
import {
  OAuthProviderService,
  type OAuthProvider,
  type ProviderIdentity,
} from './oauth-provider.service';
import { runRedisSecurity } from './redis-security';

export type OAuthIntent = 'login' | 'register' | 'link';
export type OAuthPublicRole = 'PARENT' | 'SPECIALIST';
export interface OAuthStart {
  provider: OAuthProvider;
  intent: 'login' | 'register';
  role?: OAuthPublicRole;
  challenge: string;
}
export interface OAuthCompletion {
  identity: ProviderIdentity;
  intent: OAuthIntent;
  role?: OAuthPublicRole;
  linkUserId?: string;
}
interface PendingState {
  provider: OAuthProvider;
  intent: OAuthIntent;
  role?: OAuthPublicRole;
  linkUserId?: string;
  challenge: string;
  nonce: string;
  codeVerifier: string;
}
interface PendingCompletion extends OAuthCompletion {
  challenge: string;
}

// Match the binding before deleting: a wrong provider/verifier cannot destroy
// another transaction. Redis serializes the check and single-use consumption.
export const OAUTH_CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
if redis.call('PTTL', KEYS[1]) <= 0 then return false end
local ok, value = pcall(cjson.decode, raw)
if not ok or type(value) ~= 'table' then return false end
if value[ARGV[1]] ~= ARGV[2] then return false end
redis.call('DEL', KEYS[1])
return raw
`;
const opaque = () => randomBytes(32).toString('base64url');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
const opaquePattern = /^[A-Za-z0-9_-]{43}$/;
const invalid = () =>
  new UnauthorizedException('Provider authentication failed');
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class OAuthFlowService {
  constructor(
    @Inject(RedisToken()) private readonly redis: RedisClientType,
    private readonly providers: OAuthProviderService,
  ) {}

  async start(dto: OAuthStart): Promise<{ authorizationUrl: string }> {
    if (
      !dto ||
      !['GOOGLE', 'FACEBOOK'].includes(dto.provider) ||
      !['login', 'register'].includes(dto.intent) ||
      !opaquePattern.test(dto.challenge) ||
      (dto.intent === 'register' &&
        dto.role !== 'PARENT' &&
        dto.role !== 'SPECIALIST') ||
      (dto.intent === 'login' && dto.role !== undefined)
    )
      throw new BadRequestException('Invalid provider authentication request');
    return this.startTransaction(dto);
  }

  async startLink(
    provider: OAuthProvider,
    challenge: string,
    authenticatedUserId: string,
  ): Promise<{ authorizationUrl: string }> {
    if (
      !['GOOGLE', 'FACEBOOK'].includes(provider) ||
      !opaquePattern.test(challenge) ||
      !isUUID(authenticatedUserId)
    )
      throw new BadRequestException('Invalid provider linking request');
    return this.startTransaction({
      provider,
      challenge,
      intent: 'link',
      linkUserId: authenticatedUserId,
    });
  }

  private async startTransaction(
    dto:
      | OAuthStart
      | {
          provider: OAuthProvider;
          challenge: string;
          intent: 'link';
          linkUserId: string;
        },
  ): Promise<{ authorizationUrl: string }> {
    const state = opaque();
    const nonce = opaque();
    const codeVerifier = opaque();
    const authorizationUrl = this.providers.createAuthorization(dto.provider, {
      state,
      nonce,
      codeVerifier,
      codeChallenge: digest(codeVerifier),
    });
    // Explicit projection prevents extra request fields (role/status/user IDs)
    // from becoming trusted transaction data even for direct service callers.
    const pending: PendingState = {
      provider: dto.provider,
      intent: dto.intent,
      challenge: dto.challenge,
      nonce,
      codeVerifier,
      ...(dto.intent === 'register' ? { role: dto.role } : {}),
      ...(dto.intent === 'link' ? { linkUserId: dto.linkUserId } : {}),
    };
    await this.save('state', state, pending, 600);
    return { authorizationUrl };
  }

  async callback(
    provider: OAuthProvider,
    code: string,
    state: string,
  ): Promise<string> {
    if (
      !['GOOGLE', 'FACEBOOK'].includes(provider) ||
      typeof state !== 'string' ||
      !opaquePattern.test(state) ||
      typeof code !== 'string' ||
      !code ||
      code.length > 4096
    )
      throw invalid();
    const raw = await this.consume('state', state, 'provider', provider);
    const pending = this.parse(raw);
    if (
      !this.validIntent(pending) ||
      pending.provider !== provider ||
      typeof pending.nonce !== 'string' ||
      !opaquePattern.test(pending.nonce) ||
      typeof pending.codeVerifier !== 'string' ||
      !opaquePattern.test(pending.codeVerifier) ||
      typeof pending.challenge !== 'string' ||
      !opaquePattern.test(pending.challenge)
    )
      throw invalid();
    const identity = await this.providers.exchange(provider, code, {
      nonce: pending.nonce,
      codeVerifier: pending.codeVerifier,
    });
    if (!this.validIdentity(identity) || identity.provider !== provider)
      throw invalid();
    const completionId = opaque();
    const completion: PendingCompletion = {
      identity,
      intent: pending.intent,
      challenge: pending.challenge,
      ...(pending.intent === 'register'
        ? { role: pending.role as OAuthPublicRole }
        : {}),
      ...(pending.intent === 'link'
        ? { linkUserId: pending.linkUserId as string }
        : {}),
    };
    await this.save('completion', completionId, completion, 120);
    return completionId;
  }

  async finish(id: string, verifier: string): Promise<OAuthCompletion> {
    if (
      typeof id !== 'string' ||
      !opaquePattern.test(id) ||
      typeof verifier !== 'string' ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
    )
      throw invalid();
    const raw = await this.consume(
      'completion',
      id,
      'challenge',
      digest(verifier),
    );
    const completion = this.parse(raw);
    if (
      !this.validIntent(completion) ||
      !this.validIdentity(completion.identity)
    )
      throw invalid();
    return {
      identity: completion.identity,
      intent: completion.intent,
      ...(completion.intent === 'register'
        ? { role: completion.role as OAuthPublicRole }
        : {}),
      ...(completion.intent === 'link'
        ? { linkUserId: completion.linkUserId as string }
        : {}),
    };
  }

  private key(kind: 'state' | 'completion', token: string): string {
    return `auth:oauth:${kind}:${digest(token)}`;
  }

  private async save(
    kind: 'state' | 'completion',
    token: string,
    data: PendingState | PendingCompletion,
    seconds: number,
  ): Promise<void> {
    const result = await runRedisSecurity(this.redis, () =>
      this.redis.set(this.key(kind, token), JSON.stringify(data), {
        EX: seconds,
        NX: true,
      }),
    );
    if (result !== 'OK')
      throw new ServiceUnavailableException(
        'Provider authentication unavailable',
      );
  }

  private async consume(
    kind: 'state' | 'completion',
    token: string,
    field: 'provider' | 'challenge',
    binding: string,
  ): Promise<string> {
    const result = await runRedisSecurity(this.redis, () =>
      this.redis.eval(OAUTH_CONSUME_SCRIPT, {
        keys: [this.key(kind, token)],
        arguments: [field, binding],
      }),
    );
    if (typeof result !== 'string') throw invalid();
    return result;
  }

  private parse(raw: string): Record<string, unknown> {
    try {
      const value: unknown = JSON.parse(raw);
      if (object(value)) return value;
    } catch {
      /* Fail closed without logging stored identity. */
    }
    throw invalid();
  }

  private validIntent(
    value: Record<string, unknown>,
  ): value is Record<string, unknown> & { intent: OAuthIntent } {
    return (
      (value.intent === 'login' &&
        value.role === undefined &&
        value.linkUserId === undefined) ||
      (value.intent === 'register' &&
        value.linkUserId === undefined &&
        (value.role === 'PARENT' || value.role === 'SPECIALIST')) ||
      (value.intent === 'link' &&
        value.role === undefined &&
        typeof value.linkUserId === 'string' &&
        isUUID(value.linkUserId))
    );
  }

  private validIdentity(value: unknown): value is ProviderIdentity {
    return (
      object(value) &&
      ['GOOGLE', 'FACEBOOK'].includes(value.provider as string) &&
      typeof value.subject === 'string' &&
      value.subject.length > 0 &&
      value.subject.length <= 255 &&
      typeof value.fullName === 'string' &&
      value.fullName.length <= 100 &&
      typeof value.emailTrusted === 'boolean' &&
      (value.provider !== 'FACEBOOK' || value.emailTrusted === false) &&
      (value.email === undefined ||
        (typeof value.email === 'string' && value.email.length <= 254)) &&
      (!value.emailTrusted || typeof value.email === 'string')
    );
  }
}
