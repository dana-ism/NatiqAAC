import { record } from "../../shared/api";
export function accountDisplayName(name: string, fallback: string) {
  const clean = name.trim();
  return clean && !/\S+@\S+/u.test(clean) ? clean : fallback;
}
export function validDisplayName(name: string) {
  const chars = Array.from(name.trim());
  return (
    chars.length > 0 &&
    chars.length <= 100 &&
    !chars.some((char) => {
      const code = char.codePointAt(0)!;
      return (
        code <= 31 ||
        code === 127 ||
        (code >= 8234 && code <= 8238) ||
        (code >= 8294 && code <= 8297)
      );
    })
  );
}
export type AdminProfile = {
  fullName: string;
  email: string;
  role: "ADMIN";
  status: "ACTIVE";
  createdAt: string;
  updatedAt: string;
  emailVerified: boolean;
  passwordEnabled: boolean;
  connectedProviders: ("GOOGLE" | "FACEBOOK")[];
};
export function adminProfileResult(v: unknown): v is AdminProfile {
  return (
    record(v) &&
    typeof v.fullName === "string" &&
    typeof v.email === "string" &&
    v.role === "ADMIN" &&
    v.status === "ACTIVE" &&
    typeof v.createdAt === "string" &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    typeof v.updatedAt === "string" &&
    Number.isFinite(Date.parse(v.updatedAt)) &&
    typeof v.emailVerified === "boolean" &&
    typeof v.passwordEnabled === "boolean" &&
    Array.isArray(v.connectedProviders) &&
    v.connectedProviders.every((p) => p === "GOOGLE" || p === "FACEBOOK") &&
    new Set(v.connectedProviders).size === v.connectedProviders.length
  );
}
