import { ConfigService } from '@nestjs/config';
import { GmailMailerService } from './gmail-mailer.service';

describe('Gmail API adapter (mock transport only)', () => {
  const mail = { subject: 'مرحبًا', html: '<p>Test</p>', text: 'Test' };
  const originalFetch = global.fetch;
  let transport: jest.Mock;
  let service: GmailMailerService;
  beforeEach(() => {
    transport = jest.fn();
    global.fetch = transport;
    service = new GmailMailerService(
      new ConfigService({
        MAIL_ENABLED: 'true',
        MAIL_FROM: 'sender@example.com',
        GMAIL_CLIENT_ID: 'synthetic-id',
        GMAIL_CLIENT_SECRET: 'synthetic-secret',
        GMAIL_REFRESH_TOKEN: 'synthetic-refresh',
      }),
    );
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('fails closed when not explicitly configured', async () => {
    const disabled = new GmailMailerService(new ConfigService({}));
    await expect(disabled.send('recipient@example.com', mail)).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects header injection without contacting Google', async () => {
    await expect(
      service.send('recipient@example.com', {
        ...mail,
        subject: 'Hello\r\nBcc: victim@example.com',
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses OAuth refresh, MIME alternatives and caches the access token', async () => {
    transport
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'synthetic-access',
            expires_in: 3600,
          }),
        ),
      )
      .mockResolvedValue(new Response('{}'));
    await service.send('recipient@example.com', mail);
    await service.send('recipient@example.com', mail);
    expect(transport).toHaveBeenCalledTimes(3);
    const send = transport.mock.calls[1][1] as RequestInit;
    const encoded = JSON.parse(send.body as string) as { raw: string };
    const mime = Buffer.from(encoded.raw, 'base64url').toString('utf8');
    expect(mime).toContain('multipart/alternative');
    expect(mime).toContain('text/plain; charset=UTF-8');
    expect(mime).toContain('text/html; charset=UTF-8');
    expect(mime).not.toContain('synthetic-refresh');
  });
  it('sanitizes provider errors and does not retry ambiguous sending failures', async () => {
    transport
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'synthetic-access',
            expires_in: 3600,
          }),
        ),
      )
      .mockRejectedValueOnce(new Error('sensitive transport error'));
    await expect(service.send('recipient@example.com', mail)).rejects.toThrow(
      'Email sending is temporarily unavailable',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('refuses a failed or malformed token response', async () => {
    transport.mockResolvedValue(
      new Response(JSON.stringify({ error: 'sensitive provider detail' }), {
        status: 401,
      }),
    );
    await expect(service.send('recipient@example.com', mail)).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
