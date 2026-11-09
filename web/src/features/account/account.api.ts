import { record, request } from "../../shared/api";
import type { Locale } from "../../i18n/messages";
import type { Registration, Role } from "../auth/types";

export interface MessageResult {
  message: string;
}
export function messageResult(v: unknown): v is MessageResult {
  return record(v) && typeof v.message === "string";
}
export interface RegistrationResult extends MessageResult {
  verification: { emailSent: boolean };
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "PARENT" | "SPECIALIST";
    status: string;
    createdAt: string;
  };
}
export function registrationResult(v: unknown): v is RegistrationResult {
  return (
    messageResult(v) &&
    record(v) &&
    record(v.verification) &&
    typeof v.verification.emailSent === "boolean" &&
    record(v.user) &&
    typeof v.user.id === "string" &&
    typeof v.user.fullName === "string" &&
    typeof v.user.email === "string" &&
    ["PARENT", "SPECIALIST"].includes(String(v.user.role)) &&
    typeof v.user.status === "string" &&
    typeof v.user.createdAt === "string"
  );
}
export const accountApi = {
  register: (
    kind: "parent" | "specialist",
    body: Registration & {
      locale: Locale;
      specialization?: string;
      qualification?: string;
      summary?: string;
    },
    signal?: AbortSignal,
  ) =>
    request(`/auth/register/${kind}`, 201, registrationResult, {
      body,
      signal,
    }),
  verify: (token: string) =>
    request("/auth/email/verify", 200, messageResult, { body: { token } }),
  resend: (email: string, locale: Locale) =>
    request("/auth/email/resend-verification", 200, messageResult, {
      body: { email, locale },
    }),
};
export const applicationStates = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type ApplicationState = (typeof applicationStates)[number];
export interface Review {
  decision: string;
  reason: string | null;
  createdAt: string;
}
export interface ApplicationSummary {
  id: string;
  status: ApplicationState;
  fullName: string;
  email: string;
  specialization: string;
  qualification: string;
  submittedAt: string | null;
}
export interface ApplicationDetails {
  id: string;
  status: ApplicationState;
  specialization: string;
  qualification: string;
  summary: string | null;
  hasDocument: boolean;
  reviews: Review[];
}
export function applicationDetails(v: unknown): v is ApplicationDetails {
  return (
    record(v) &&
    typeof v.id === "string" &&
    applicationStates.includes(v.status as ApplicationState) &&
    typeof v.specialization === "string" &&
    typeof v.qualification === "string" &&
    (v.summary === null || typeof v.summary === "string") &&
    typeof v.hasDocument === "boolean" &&
    Array.isArray(v.reviews) &&
    v.reviews.every(
      (r) =>
        record(r) &&
        typeof r.decision === "string" &&
        (r.reason === null || typeof r.reason === "string") &&
        typeof r.createdAt === "string",
    )
  );
}
export function applicationSummary(v: unknown): v is ApplicationSummary {
  return (
    record(v) &&
    typeof v.id === "string" &&
    applicationStates.includes(v.status as ApplicationState) &&
    typeof v.fullName === "string" &&
    typeof v.email === "string" &&
    typeof v.specialization === "string" &&
    typeof v.qualification === "string" &&
    (v.submittedAt === null || typeof v.submittedAt === "string")
  );
}
export function applicationList(
  v: unknown,
): v is { applications: ApplicationSummary[] } {
  return (
    record(v) &&
    Array.isArray(v.applications) &&
    v.applications.every(applicationSummary)
  );
}
export function applicationEnvelope(
  v: unknown,
): v is { application: ApplicationDetails & ApplicationSummary } {
  return (
    record(v) &&
    applicationDetails(v.application) &&
    applicationSummary(v.application)
  );
}
export interface Onboarding {
  userId: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  legacyAuthExempt: boolean;
}
export function onboardingResult(v: unknown): v is Onboarding {
  return (
    record(v) &&
    typeof v.userId === "string" &&
    typeof v.email === "string" &&
    ["PARENT", "SPECIALIST", "ADMIN"].includes(String(v.role)) &&
    typeof v.emailVerified === "boolean" &&
    typeof v.legacyAuthExempt === "boolean"
  );
}
