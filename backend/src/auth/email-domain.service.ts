import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { isEmail } from 'class-validator';
import { REVIEWED_DISPOSABLE_DOMAINS } from './email-domain-blocklist';
import { normalizeEmail } from './normalize-email';

export const EMAIL_DOMAIN_OPTIONS = Symbol('EMAIL_DOMAIN_OPTIONS');

export interface EmailDomainResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
  cancel(): void;
}

export interface EmailDomainOptions {
  /** Additional reviewed entries; matching includes subdomains. */
  disposableDomains?: readonly string[];
  resolverFactory?: () => EmailDomainResolver;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  maxConcurrentChecks?: number;
}

const RESERVED_SUFFIXES = [
  'test',
  'invalid',
  'example',
  'localhost',
  'local',
  'internal',
  'onion',
  'home.arpa',
  'in-addr.arpa',
  'ip6.arpa',
  'example.com',
  'example.net',
  'example.org',
];

/** Registration-only validation. Never apply DNS checks to existing-account login. */
@Injectable()
export class EmailDomainService {
  private readonly resolverFactory: () => EmailDomainResolver;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly maxConcurrentChecks: number;
  private readonly disposable: Set<string>;
  private readonly cache = new Map<
    string,
    { valid: boolean; expires: number }
  >();
  private readonly pending = new Map<string, Promise<boolean>>();

  constructor(
    @Optional() @Inject(EMAIL_DOMAIN_OPTIONS) options: EmailDomainOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.cacheTtlMs = options.cacheTtlMs ?? 300_000;
    this.maxCacheEntries = options.maxCacheEntries ?? 1000;
    this.maxConcurrentChecks = options.maxConcurrentChecks ?? 32;
    for (const value of [
      this.timeoutMs,
      this.cacheTtlMs,
      this.maxCacheEntries,
      this.maxConcurrentChecks,
    ]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error('Email domain limits must be positive safe integers');
      }
    }
    this.resolverFactory =
      options.resolverFactory ??
      (() =>
        new Resolver({
          timeout: this.timeoutMs,
          tries: 1,
        }));
    this.disposable = new Set(REVIEWED_DISPOSABLE_DOMAINS);
    for (const domain of options.disposableDomains ?? []) {
      const canonical = domainToASCII(domain.trim().toLowerCase());
      if (!this.isDomain(canonical)) {
        throw new Error('Invalid reviewed disposable domain configuration');
      }
      this.disposable.add(canonical);
    }
  }

  /** Returns normalized identity, preserving plus suffixes and local-part dots. */
  async validateForRegistration(email: string): Promise<string> {
    // Reject controls before trimming so CR/LF cannot disappear during normalization.
    // eslint-disable-next-line no-control-regex
    if (typeof email !== 'string' || /[\u0000-\u001f\u007f]/u.test(email)) {
      throw this.invalidEmail();
    }
    const normalized = normalizeEmail(email);
    if (Buffer.byteLength(normalized, 'utf8') > 254 || !isEmail(normalized)) {
      throw this.invalidEmail();
    }
    const domain = domainToASCII(
      normalized.slice(normalized.lastIndexOf('@') + 1),
    );
    if (
      !this.isDomain(domain) ||
      RESERVED_SUFFIXES.some((suffix) => this.matches(domain, suffix))
    ) {
      throw this.invalidEmail();
    }
    const labels = domain.split('.');
    for (let i = 0; i < labels.length - 1; i++) {
      if (this.disposable.has(labels.slice(i).join('.'))) {
        throw new BadRequestException('Please use a permanent email address');
      }
    }
    if (!(await this.hasMailRoute(domain))) {
      throw new BadRequestException('Email domain cannot receive mail');
    }
    return normalized;
  }

  private isDomain(domain: string): boolean {
    const labels = domain.split('.');
    return (
      domain.length <= 253 &&
      !isIP(domain) &&
      labels.length >= 2 &&
      !/^\d+$/u.test(labels.at(-1)!) &&
      labels.every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
      )
    );
  }

  private matches(domain: string, suffix: string): boolean {
    return domain === suffix || domain.endsWith(`.${suffix}`);
  }

  private invalidEmail(): BadRequestException {
    return new BadRequestException(
      'Please provide a valid public email address',
    );
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Email domain validation is temporarily unavailable; please retry',
    );
  }

  private async hasMailRoute(domain: string): Promise<boolean> {
    const cached = this.cache.get(domain);
    if (cached && cached.expires > Date.now()) return cached.valid;
    this.cache.delete(domain);
    const existing = this.pending.get(domain);
    if (existing) return existing;
    if (this.pending.size >= this.maxConcurrentChecks) throw this.unavailable();
    const task = this.lookup(domain);
    this.pending.set(domain, task);
    try {
      const valid = await task;
      if (this.cache.size >= this.maxCacheEntries) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(domain, { valid, expires: Date.now() + this.cacheTtlMs });
      return valid;
    } finally {
      this.pending.delete(domain);
    }
  }

  private async lookup(domain: string): Promise<boolean> {
    const resolver = this.resolverFactory();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(this.unavailable());
        resolver.cancel();
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        this.resolveMailRoute(resolver, domain),
        deadline,
      ]);
    } catch {
      // DNS responses may include network/server details: never return those.
      // Temporary failures are not cached as permanent invalid-domain verdicts.
      throw this.unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveMailRoute(
    resolver: EmailDomainResolver,
    domain: string,
  ): Promise<boolean> {
    let mx: { exchange: string; priority: number }[];
    try {
      mx = await resolver.resolveMx(domain);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOTFOUND') return false;
      if (code !== 'ENODATA') throw error;
      mx = [];
    }
    if (mx.length > 0) {
      // RFC 7505: Node may represent the root null-MX exchange as '' or '.'.
      return !mx.some(
        (entry) => entry.exchange === '' || entry.exchange === '.',
      );
    }
    // RFC 5321 implicit MX is allowed only when MX records are absent.
    const addresses = await Promise.allSettled([
      resolver.resolve4(domain),
      resolver.resolve6(domain),
    ]);
    if (
      addresses.some(
        (result) => result.status === 'fulfilled' && result.value.length > 0,
      )
    ) {
      return true;
    }
    for (const result of addresses) {
      if (result.status === 'rejected') {
        const code = (result.reason as NodeJS.ErrnoException).code;
        if (code !== 'ENODATA' && code !== 'ENOTFOUND') throw result.reason;
      }
    }
    return false;
  }
}
