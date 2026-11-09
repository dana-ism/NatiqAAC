/**
 * Reviewed seed, not exhaustive disposable detection. No runtime downloads.
 * Source: https://github.com/disposable-email-domains/disposable-email-domains
 * Snapshot: ba992a0b4c867db3ff39605696bb7de9fbb2e11f, reviewed 2026-11-09.
 * Source license: CC0 1.0 (public domain dedication).
 * Review updates against disposable_email_blocklist.conf and upstream removals;
 * review legitimate-provider false positives before changing this set. Additional
 * reviewed domains can be supplied through EMAIL_DOMAIN_OPTIONS. Do not describe
 * this small seed as comprehensive protection. Email ownership still needs proof.
 */
export const REVIEWED_DISPOSABLE_DOMAINS: readonly string[] = [
  '10minutemail.com',
  'dispostable.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'maildrop.cc',
  'mailinator.com',
  'moakt.com',
  'sharklasers.com',
  'temp-mail.org',
  'yopmail.com',
];
