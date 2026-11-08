import type { Registration } from "./types";
import type { MessageKey } from "../../i18n/ar";
export type FieldErrors = Partial<Record<keyof Registration, MessageKey>>;
export function validate(values: Registration, register: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (register && !values.fullName.trim())
    errors.fullName = "validation.nameRequired";
  else if (register && [...values.fullName.trim()].length > 100)
    errors.fullName = "validation.nameLong";
  if (!values.email.trim()) errors.email = "validation.emailRequired";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "validation.emailInvalid";
  if (!values.password) errors.password = "validation.passwordRequired";
  else if ([...values.password].length < 8)
    errors.password = "validation.passwordShort";
  else if (
    [...values.password].length > 72 ||
    new TextEncoder().encode(values.password).length > 72
  )
    errors.password = "validation.passwordLong";
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
