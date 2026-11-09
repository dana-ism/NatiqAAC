import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/** Gmail API adapter. Disabled until the owner explicitly enables sending. */
@Injectable()
export class GmailMailerService {
  private token?: { value: string; until: number };
  private refreshing?: Promise<string>;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      this.config.get<string>('MAIL_ENABLED') === 'true' &&
      [
        'MAIL_FROM',
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
      ].every((key) => !!this.config.get<string>(key))
    );
  }

  async send(to: string, mail: RenderedMail): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM') ?? '';
    if (
      !this.isConfigured() ||
      !isEmail(from) ||
      !isEmail(to) ||
      /[\r\n]/.test(from + to + mail.subject)
    ) {
      throw this.unavailable();
    }
    const accessToken = await this.accessToken();
    const boundary = 'natiqaac-alternative';
    const raw = [
      `From: NatiqAAC <${from}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      ...(['text/plain', 'text/html'] as const).flatMap((type, index) => [
        `--${boundary}`,
        `Content-Type: ${type}; charset=UTF-8`,
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(index ? mail.html : mail.text)
          .toString('base64')
          .match(/.{1,76}/g)
          ?.join('\r\n') ?? '',
      ]),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    try {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw this.unavailable();
      // API acceptance is not proof of inbox delivery. Never blindly retry a timeout.
    } catch {
      throw this.unavailable();
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = undefined;
    }
  }

  private async refresh(): Promise<string> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.getOrThrow<string>('GMAIL_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>('GMAIL_CLIENT_SECRET'),
          refresh_token: this.config.getOrThrow<string>('GMAIL_REFRESH_TOKEN'),
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== 'object')
        throw this.unavailable();
      const claims = result as Record<string, unknown>;
      if (
        typeof claims.access_token !== 'string' ||
        !claims.access_token ||
        typeof claims.expires_in !== 'number' ||
        !Number.isFinite(claims.expires_in) ||
        claims.expires_in < 1
      )
        throw this.unavailable();
      this.token = {
        value: claims.access_token,
        until:
          Date.now() +
          Math.max(0, Math.min(claims.expires_in, 3600) - 60) * 1000,
      };
      return claims.access_token;
    } catch {
      throw this.unavailable();
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Email sending is temporarily unavailable',
    );
  }
}
