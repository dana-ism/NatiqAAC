export type MailLocale = 'ar' | 'en';

interface MailTemplateBase {
  locale: MailLocale;
  fullName: string;
  actionUrl: string;
}

export type MailTemplateInput = MailTemplateBase &
  (
    | { kind: 'verification' | 'verification-resend'; expiresInMinutes: number }
    | {
        kind:
          | 'welcome'
          | 'application-received'
          | 'specialist-approved'
          | 'specialist-rejected';
      }
  );

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

interface TemplateCopy {
  title: string;
  description: string;
  action: string;
  note: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character];
  });
}

// Deployment origin allowlisting belongs to the caller. Templates enforce safe
// clickable protocols and permit HTTP only for explicit local development.
function safeActionUrl(value: string): string {
  const invalid = () => new Error('Invalid mail action URL');
  if (
    /\s/u.test(value) ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password
  ) {
    throw invalid();
  }
  return url.href;
}

function copy(input: MailTemplateInput): TemplateCopy {
  const ar = input.locale === 'ar';
  switch (input.kind) {
    case 'verification':
    case 'verification-resend': {
      if (
        !Number.isSafeInteger(input.expiresInMinutes) ||
        input.expiresInMinutes < 1
      ) {
        throw new Error('Invalid mail verification expiration');
      }
      const resend = input.kind === 'verification-resend';
      return {
        title: ar
          ? resend
            ? 'رابط جديد لتأكيد بريدك الإلكتروني'
            : 'تأكيد بريدك الإلكتروني'
          : resend
            ? 'Your new email verification link'
            : 'Verify your email address',
        description: ar
          ? resend
            ? 'تلقينا طلبًا لإرسال رابط تأكيد جديد لحسابك على NatiqAAC. استخدم هذا الرابط لإكمال تأكيد بريدك الإلكتروني.'
            : 'تلقينا طلبًا لإنشاء حساب على NatiqAAC باستخدام هذا البريد الإلكتروني. أكّد بريدك لإكمال هذه الخطوة من التسجيل.'
          : resend
            ? 'We received a request for a new verification link for your NatiqAAC account. Use this link to complete email verification.'
            : 'We received a request to create a NatiqAAC account using this email address. Verify your email to complete this registration step.',
        action: ar ? 'تأكيد البريد الإلكتروني' : 'Verify email address',
        note: ar
          ? `تنتهي صلاحية هذا الرابط خلال ${input.expiresInMinutes} دقيقة، ويمكن استخدامه مرة واحدة. لا تشارك الرابط مع أي شخص. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.`
          : `This link expires in ${input.expiresInMinutes} minutes and can be used once. Do not share it with anyone. If you did not make this request, you can safely ignore this email.`,
      };
    }
    case 'welcome':
      return {
        title: ar ? 'مرحبًا بك في NatiqAAC' : 'Welcome to NatiqAAC',
        description: ar
          ? 'تم تفعيل حسابك. يوفّر NatiqAAC أدوات لدعم التواصل وتعلّم اللغة. يمكنك الآن الدخول إلى المنصة والبدء.'
          : 'Your account is now active. NatiqAAC provides tools to support communication and language learning. You can now enter the platform and get started.',
        action: ar ? 'الدخول إلى المنصة' : 'Open NatiqAAC',
        note: ar
          ? 'حافظ على أمان حسابك ولا تشارك بيانات تسجيل الدخول.'
          : 'Keep your account secure and do not share your sign-in details.',
      };
    case 'application-received':
      return {
        title: ar ? 'استلمنا طلبك كأخصائي' : 'Specialist application received',
        description: ar
          ? 'شكرًا لاهتمامك بالانضمام إلى NatiqAAC. استلمنا طلبك المهني وهو بانتظار مراجعة الإدارة. هذه الرسالة لا تعني الموافقة على الطلب أو تفعيل صلاحيات الأخصائي.'
          : 'Thank you for your interest in joining NatiqAAC. We received your professional application and it is awaiting administrative review. This message does not confirm approval or activate specialist access.',
        action: ar ? 'عرض حالة الطلب' : 'View application status',
        note: ar
          ? 'سنبلغك عند اتخاذ قرار بشأن طلبك.'
          : 'We will notify you when a decision has been made.',
      };
    case 'specialist-approved':
      return {
        title: ar
          ? 'تمت الموافقة على طلبك كأخصائي'
          : 'Specialist application approved',
        description: ar
          ? 'وافقت إدارة NatiqAAC على طلبك المهني. مرحبًا بك! يمكنك الدخول للاطلاع على حسابك وخيارات الأخصائي المتاحة لك.'
          : 'The NatiqAAC administrator approved your professional application. Welcome! Sign in to view your account and the specialist options available to you.',
        action: ar ? 'الدخول إلى المنصة' : 'Open NatiqAAC',
        note: ar
          ? 'حافظ على خصوصية بيانات الأشخاص الذين تدعمهم.'
          : 'Protect the privacy of the people you support.',
      };
    case 'specialist-rejected':
      return {
        title: ar
          ? 'تحديث بشأن طلبك كأخصائي'
          : 'An update on your specialist application',
        description: ar
          ? 'شكرًا لاهتمامك بالانضمام إلى NatiqAAC. بعد مراجعة طلبك المهني، قررت الإدارة عدم الموافقة عليه. يمكنك الاطلاع على حالة طلبك داخل المنصة.'
          : 'Thank you for your interest in joining NatiqAAC. After reviewing your professional application, the administrator decided not to approve it. You can view your application status in the platform.',
        action: ar ? 'عرض حالة الطلب' : 'View application status',
        note: ar
          ? 'لا تتضمن هذه الرسالة تفاصيل المراجعة حفاظًا على الخصوصية.'
          : 'Review details are not included in this email to protect privacy.',
      };
  }
}

/** Pure rendering only: no sender identity, transport, logging or delivery claim. */
export function renderMailTemplate(input: MailTemplateInput): RenderedMail {
  if (input.locale !== 'ar' && input.locale !== 'en') {
    throw new Error('Unsupported mail locale');
  }
  const actionUrl = safeActionUrl(input.actionUrl);
  const content = copy(input);
  const ar = input.locale === 'ar';
  const direction = ar ? 'rtl' : 'ltr';
  const alignment = ar ? 'right' : 'left';
  const greeting = ar
    ? `مرحبًا ${input.fullName}،`
    : `Hello ${input.fullName},`;
  const fallback = ar
    ? 'إذا لم يعمل الزر، انسخ الرابط التالي وافتحه في متصفحك:'
    : 'If the button does not work, copy this link into your browser:';
  const html = `<!doctype html>
<html lang="${input.locale}" dir="${direction}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.title)}</title></head>
<body style="margin:0;padding:0;background-color:#f7faf8;color:#21363d;font-family:Tahoma,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f7faf8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${direction}" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #c9d6d3;border-radius:14px;text-align:${alignment};">
<tr><td style="padding:28px 24px;background-color:#ddf3ee;border-radius:14px 14px 0 0;color:#176b68;font-size:24px;font-weight:bold;"><span dir="ltr">NatiqAAC</span></td></tr>
<tr><td style="padding:28px 24px;">
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.5;">${escapeHtml(content.title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.8;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.8;">${escapeHtml(content.description)}</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background-color:#176b68;color:#ffffff;padding:14px 22px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;line-height:1.5;">${escapeHtml(content.action)}</a></p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:#5e7073;">${escapeHtml(content.note)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.8;">${fallback}</p>
<p dir="ltr" style="margin:0;font-size:13px;line-height:1.8;word-break:break-all;overflow-wrap:anywhere;"><a href="${escapeHtml(actionUrl)}" style="color:#176b68;">${escapeHtml(actionUrl)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: `NatiqAAC — ${content.title}`,
    html,
    text: [
      'NatiqAAC',
      content.title,
      greeting,
      content.description,
      `${content.action}: ${actionUrl}`,
      content.note,
    ].join('\n\n'),
  };
}
