import type { Registration } from "./types";
export type FieldErrors = Partial<Record<keyof Registration, string>>;
export function validate(values: Registration, register: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (register && !values.fullName.trim())
    errors.fullName = "أدخل الاسم الكامل.";
  else if (register && [...values.fullName.trim()].length > 100)
    errors.fullName = "يجب ألا يتجاوز الاسم 100 حرف.";
  if (!values.email.trim()) errors.email = "أدخل البريد الإلكتروني.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "أدخل بريدًا إلكترونيًا صالحًا.";
  if (!values.password) errors.password = "أدخل كلمة المرور.";
  else if ([...values.password].length < 8)
    errors.password = "استخدم 8 أحرف على الأقل.";
  else if (
    [...values.password].length > 72 ||
    new TextEncoder().encode(values.password).length > 72
  )
    errors.password =
      "كلمة المرور طويلة جدًا؛ الحد 72 بايت، وقد تشغل الأحرف العربية أكثر من بايت.";
  return errors;
}

// Used only to schedule local expiry. /auth/me remains the authority for identity.
export function expiresAt(token: string): number {
  try {
    const raw = token.split(".")[1];
    const payload: unknown = JSON.parse(
      atob(raw.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "exp" in payload &&
      typeof payload.exp === "number" &&
      Number.isSafeInteger(payload.exp)
    )
      return payload.exp * 1000;
  } catch {
    /* Reject malformed tokens locally without logging them. */
  }
  return 0;
}
