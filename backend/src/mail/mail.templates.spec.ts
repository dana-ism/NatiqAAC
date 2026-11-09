import {
  renderMailTemplate,
  type MailLocale,
  type MailTemplateInput,
} from './mail.templates';

const common = {
  fullName: 'Synthetic User',
  actionUrl: 'https://natiq.example/verify?token=synthetic&language=en',
};
const kinds: MailTemplateInput['kind'][] = [
  'verification',
  'verification-resend',
  'welcome',
  'application-received',
  'specialist-approved',
  'specialist-rejected',
];

describe('mail templates', () => {
  describe.each<MailLocale>(['en', 'ar'])('%s locale', (locale) => {
    it.each(kinds)('renders %s with localized HTML and plain text', (kind) => {
      const mail = renderMailTemplate({
        ...common,
        locale,
        kind,
        expiresInMinutes: 45,
      });
      expect(mail.subject).toContain('NatiqAAC');
      expect(mail.subject).not.toMatch(/[\r\n]/);
      expect(mail.html).toContain(
        `<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`,
      );
      expect(mail.html).toContain('max-width:600px');
      expect(mail.html).toContain('name="viewport"');
      expect(mail.html).toContain('Synthetic User');
      expect(mail.html).toContain(
        'href="https://natiq.example/verify?token=synthetic&amp;language=en"',
      );
      expect(mail.text).toContain(common.actionUrl);
      expect(mail.text).toContain(common.fullName);
      expect(mail.text).not.toContain('<html');
      expect(mail.html).not.toMatch(/<script|<img|mailto:/);
      if (locale === 'ar') {
        expect(mail.text).toMatch(/[\u0600-\u06ff]/u);
      } else {
        expect(mail.text).toContain('Hello Synthetic User,');
      }
    });
  });

  it('escapes a malicious name in HTML and excludes names from subjects', () => {
    const fullName = '<img src=x onerror="alert(1)"> & \'name\'\r\nBcc: other';
    const mail = renderMailTemplate({
      ...common,
      kind: 'welcome',
      locale: 'en',
      fullName,
    });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
    expect(mail.html).toContain('&amp; &#39;name&#39;');
    expect(mail.subject).not.toContain('Bcc');
    expect(mail.text).toContain(fullName);
  });

  it('escapes URL attribute delimiters without changing the link destination', () => {
    const mail = renderMailTemplate({
      ...common,
      kind: 'welcome',
      locale: 'en',
      actionUrl: "https://natiq.example/?x=\"onmouseover=alert(1)&a='test'",
    });
    expect(mail.html).not.toContain('href="https://natiq.example/?x="');
    expect(mail.html).toContain('%22onmouseover=alert(1)&amp;a=%27test%27');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//natiq.example/',
    '/verify',
    'http://natiq.example/',
    'http://localhost.attacker.example/',
    'http://127.0.0.1.attacker.example/',
    'https://user:password@natiq.example/',
    'https://natiq.example/\r\nBcc:other',
    ' https://natiq.example/',
  ])(
    'rejects unsafe action URL %s without exposing it in the error',
    (actionUrl) => {
      expect(() =>
        renderMailTemplate({
          ...common,
          kind: 'welcome',
          locale: 'en',
          actionUrl,
        }),
      ).toThrow('Invalid mail action URL');
    },
  );

  it.each([
    'http://localhost:5173/verify',
    'http://127.0.0.1:5173/verify',
    'http://[::1]:5173/verify',
  ])('permits an explicit local development URL %s', (actionUrl) => {
    expect(
      renderMailTemplate({
        ...common,
        kind: 'welcome',
        locale: 'en',
        actionUrl,
      }).text,
    ).toContain(actionUrl);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid verification expiration %s',
    (expiresInMinutes) => {
      expect(() =>
        renderMailTemplate({
          ...common,
          kind: 'verification',
          locale: 'en',
          expiresInMinutes,
        }),
      ).toThrow('Invalid mail verification expiration');
    },
  );

  it('provides verification expiration, one-use warning and unsolicited-request guidance', () => {
    const mail = renderMailTemplate({
      ...common,
      kind: 'verification',
      locale: 'en',
      expiresInMinutes: 45,
    });
    expect(mail.text).toContain('45 minutes');
    expect(mail.text).toContain('used once');
    expect(mail.text).toContain('Do not share');
    expect(mail.text).toContain('safely ignore');
  });

  it('distinguishes receipt from professional approval and activation', () => {
    const mail = renderMailTemplate({
      ...common,
      kind: 'application-received',
      locale: 'en',
    });
    expect(mail.text).toContain('awaiting administrative review');
    expect(mail.text).toContain('does not confirm approval or activate');
  });

  it('never includes private rejection reasons supplied by a wider runtime object', () => {
    const input = {
      ...common,
      kind: 'specialist-rejected' as const,
      locale: 'en' as const,
      rejectionReason: 'PRIVATE_SYNTHETIC_REVIEW_DETAIL',
    };
    const mail = renderMailTemplate(input);
    expect(mail.text).toContain('decided not to approve');
    expect(JSON.stringify(mail)).not.toContain(input.rejectionReason);
  });

  it('fails closed for an unsupported runtime locale', () => {
    expect(() =>
      renderMailTemplate({
        ...common,
        kind: 'welcome',
        locale: 'fr' as MailLocale,
      }),
    ).toThrow('Unsupported mail locale');
  });
});
