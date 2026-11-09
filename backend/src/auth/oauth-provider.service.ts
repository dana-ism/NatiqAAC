import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { createHmac } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';
export interface ProviderIdentity {
  provider: OAuthProvider;
  subject: string;
  email?: string;
  emailTrusted: boolean;
  fullName: string;
}
type Settings = {
  clientId: string;
  secret: string;
  redirect: string;
  version?: string;
};
const unavailable = () =>
  new ServiceUnavailableException('Identity provider unavailable');
const invalid = () =>
  new UnauthorizedException('Provider authentication failed');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class OAuthProviderService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(provider: OAuthProvider): boolean {
    try {
      this.settings(provider);
      return true;
    } catch {
      return false;
    }
  }

  private settings(provider: OAuthProvider): Settings {
    if (provider !== 'GOOGLE' && provider !== 'FACEBOOK') throw unavailable();
    const google = provider === 'GOOGLE';
    const clientId = this.config
      .get<string>(google ? 'GOOGLE_CLIENT_ID' : 'FACEBOOK_APP_ID')
      ?.trim();
    const secret = this.config
      .get<string>(google ? 'GOOGLE_CLIENT_SECRET' : 'FACEBOOK_APP_SECRET')
      ?.trim();
    const redirect = this.config
      .get<string>(google ? 'GOOGLE_REDIRECT_URI' : 'FACEBOOK_REDIRECT_URI')
      ?.trim();
    const version = google
      ? undefined
      : this.config.get<string>('FACEBOOK_GRAPH_VERSION')?.trim();
    if (
      !clientId ||
      !secret ||
      !redirect ||
      (!google && !/^v\d+\.\d+$/.test(version ?? ''))
    )
      throw unavailable();
    try {
      const url = new URL(redirect);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
        url.hostname,
      );
      if (
        (url.protocol !== 'https:' &&
          !(loopback && url.protocol === 'http:')) ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
    return { clientId, secret, redirect, version };
  }

  private google(settings: Settings): OAuth2Client {
    return new OAuth2Client({
      clientId: settings.clientId,
      clientSecret: settings.secret,
      redirectUri: settings.redirect,
      transporterOptions: { timeout: 5000, retry: false },
    });
  }

  createAuthorization(
    provider: OAuthProvider,
    transaction: {
      state: string;
      nonce: string;
      codeVerifier: string;
      codeChallenge: string;
    },
  ): string {
    const settings = this.settings(provider);
    if (
      !transaction.state ||
      !transaction.nonce ||
      !transaction.codeVerifier ||
      !transaction.codeChallenge
    )
      throw invalid();
    if (provider === 'GOOGLE')
      return this.google(settings).generateAuthUrl({
        response_type: 'code',
        scope: ['openid', 'email', 'profile'],
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: transaction.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        access_type: 'online',
      });
    const url = new URL(
      `https://www.facebook.com/${settings.version}/dialog/oauth`,
    );
    url.search = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirect,
      response_type: 'code',
      scope: 'public_profile,email',
      state: transaction.state,
    }).toString();
    // Standard Facebook web Login is not OIDC; do not claim nonce/PKCE enforcement.
    return url.toString();
  }

  async exchange(
    provider: OAuthProvider,
    code: string,
    transaction: {
      nonce: string;
      codeVerifier: string;
    },
  ): Promise<ProviderIdentity> {
    const settings = this.settings(provider);
    if (
      !code ||
      code.length > 4096 ||
      !transaction.nonce ||
      !transaction.codeVerifier
    )
      throw invalid();
    try {
      if (provider === 'GOOGLE')
        return await this.exchangeGoogle(settings, code, transaction);
      return await this.exchangeFacebook(settings, code);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException
      )
        throw error;
      // Provider/library exceptions may contain authorization codes, secrets or request URLs.
      throw invalid();
    }
  }

  private async exchangeGoogle(
    settings: Settings,
    code: string,
    transaction: {
      nonce: string;
      codeVerifier: string;
    },
  ): Promise<ProviderIdentity> {
    const client = this.google(settings);
    const { tokens } = await client.getToken({
      code,
      codeVerifier: transaction.codeVerifier,
      redirect_uri: settings.redirect,
    });
    if (!tokens.id_token) throw invalid();
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: settings.clientId,
    });
    const claims = ticket.getPayload();
    if (
      !claims ||
      !record(claims) ||
      claims.nonce !== transaction.nonce ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        claims.iss,
      ) ||
      claims.aud !== settings.clientId ||
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      claims.sub.length > 255
    )
      throw invalid();
    const email = this.email(claims.email);
    const verified = claims.email_verified === true;
    const hosted = typeof claims.hd === 'string' && claims.hd.length > 0;
    return {
      provider: 'GOOGLE',
      subject: claims.sub,
      email,
      emailTrusted:
        !!email && verified && (email.endsWith('@gmail.com') || hosted),
      fullName: this.name(claims.name),
    };
  }

  private async request(
    url: URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw invalid();
      const body: unknown = await response.json();
      if (!record(body) || body.error) throw invalid();
      return body;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw unavailable();
    }
  }

  private async exchangeFacebook(
    settings: Settings,
    code: string,
  ): Promise<ProviderIdentity> {
    const endpoint = `https://graph.facebook.com/${settings.version}`;
    const token = await this.request(
      new URL(`${endpoint}/oauth/access_token`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.secret,
          redirect_uri: settings.redirect,
          code,
        }),
      },
    );
    if (
      typeof token.access_token !== 'string' ||
      !token.access_token ||
      (token.token_type !== undefined &&
        (typeof token.token_type !== 'string' ||
          token.token_type.toLowerCase() !== 'bearer'))
    )
      throw invalid();
    const debugUrl = new URL(`${endpoint}/debug_token`);
    // Meta's token inspection protocol requires input_token in its server-to-server query.
    // Never log this URL or propagate fetch exceptions to HTTP responses.
    debugUrl.searchParams.set('input_token', token.access_token);
    const inspection = await this.request(debugUrl, {
      headers: {
        Authorization: `Bearer ${settings.clientId}|${settings.secret}`,
      },
    });
    const data = inspection.data;
    const now = Math.floor(Date.now() / 1000);
    if (
      !record(data) ||
      data.is_valid !== true ||
      data.app_id !== settings.clientId ||
      typeof data.user_id !== 'string' ||
      !data.user_id ||
      data.user_id.length > 255 ||
      !Number.isSafeInteger(data.expires_at) ||
      (data.expires_at as number) <= now ||
      (data.data_access_expires_at !== undefined &&
        (!Number.isSafeInteger(data.data_access_expires_at) ||
          (data.data_access_expires_at as number) <= now))
    )
      throw invalid();
    const profileUrl = new URL(`${endpoint}/me`);
    profileUrl.searchParams.set('fields', 'id,name,email');
    profileUrl.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', settings.secret)
        .update(token.access_token)
        .digest('hex'),
    );
    const profile = await this.request(profileUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (profile.id !== data.user_id) throw invalid();
    return {
      provider: 'FACEBOOK',
      subject: data.user_id,
      email: this.email(profile.email),
      emailTrusted: false,
      fullName: this.name(profile.name),
    };
  }

  private email(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && isEmail(email) ? email : undefined;
  }

  private name(value: unknown): string {
    return typeof value === 'string'
      ? Array.from(value)
          .filter(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          )
          .join('')
          .trim()
          .slice(0, 100)
      : '';
  }
}
