import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { GmailMailerService } from './gmail-mailer.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('Gmail App Password SMTP (mocked, no real mail)', () => {
  const mail = { subject: 'مرحبًا', html: '<p>Test</p>', text: 'Test' };
  const transport = {
    sendMail: jest.fn(),
    verify: jest.fn(),
    close: jest.fn(),
  };
  const config = (extra: Record<string, string> = {}) =>
    new ConfigService({
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'gmail-smtp',
      MAIL_FROM: 'sender@gmail.com',
      GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      ...extra,
    });
  beforeEach(() => {
    jest.resetAllMocks();
    (createTransport as jest.Mock).mockReturnValue(transport);
    transport.sendMail.mockResolvedValue({
      accepted: ['recipient@example.com'],
    });
    transport.verify.mockResolvedValue(true);
  });
  it('requires only sender and App Password, without OAuth credentials', () => {
    expect(new GmailMailerService(config()).isConfigured()).toBe(true);
  });
  it.each(['', 'too-short', 'invalid-password-longer-than-sixteen'])(
    'refuses invalid App Password configuration',
    (value) => {
      expect(
        new GmailMailerService(
          config({ GMAIL_APP_PASSWORD: value }),
        ).isConfigured(),
      ).toBe(false);
    },
  );
  it('keeps sending disabled until explicitly enabled', async () => {
    const service = new GmailMailerService(config({ MAIL_ENABLED: 'false' }));
    expect(service.isConfigured()).toBe(false);
    await expect(service.send('recipient@example.com', mail)).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(createTransport).not.toHaveBeenCalled();
  });
  it('uses verified TLS, bounded timeouts and the authenticated sender', async () => {
    await new GmailMailerService(config()).send('recipient@example.com', mail);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'sender@gmail.com', pass: 'abcdefghijklmnop' },
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
        connectionTimeout: 10000,
        socketTimeout: 10000,
        debug: false,
        logger: false,
      }),
    );
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: { name: 'NatiqAAC', address: 'sender@gmail.com' },
      to: 'recipient@example.com',
      ...mail,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('checks authentication without sending mail, even while delivery is disabled', async () => {
    await new GmailMailerService(
      config({ MAIL_ENABLED: 'false' }),
    ).verifyConnection();
    expect(transport.verify).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('sanitizes authentication failures', async () => {
    transport.verify.mockRejectedValue(new Error('PRIVATE_PASSWORD'));
    await expect(
      new GmailMailerService(config()).verifyConnection(),
    ).rejects.toThrow('Email sending is temporarily unavailable');
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('does not retry ambiguous SMTP failures or expose credentials', async () => {
    transport.sendMail.mockRejectedValue(new Error('PRIVATE_PASSWORD'));
    await expect(
      new GmailMailerService(config()).send('recipient@example.com', mail),
    ).rejects.toThrow('Email sending is temporarily unavailable');
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('rejects header injection before authenticating', async () => {
    await expect(
      new GmailMailerService(config()).send('recipient@example.com', {
        ...mail,
        subject: 'Hello\r\nBcc: other@example.com',
      }),
    ).rejects.toThrow();
    expect(createTransport).not.toHaveBeenCalled();
  });
  it('does not report success when the recipient was not accepted', async () => {
    transport.sendMail.mockResolvedValue({ accepted: [] });
    await expect(
      new GmailMailerService(config()).send('recipient@example.com', mail),
    ).rejects.toThrow();
  });
  it('does not silently select a transport for an invalid provider name', () => {
    expect(
      new GmailMailerService(
        config({ MAIL_TRANSPORT: 'invalid' }),
      ).isConfigured(),
    ).toBe(false);
  });
});
