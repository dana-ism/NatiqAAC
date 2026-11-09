import { record, request } from "../../shared/api";
import type {
  AuthUser,
  Credentials,
  Identity,
  LoginResult,
  Registration,
  RegisterResult,
  Role,
} from "./types";

function role(value: unknown): value is Role {
  return value === "PARENT" || value === "SPECIALIST" || value === "ADMIN";
}
function user(value: unknown): value is AuthUser {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string" &&
    typeof value.email === "string" &&
    role(value.role) &&
    ["ACTIVE", "PENDING", "SUSPENDED"].includes(String(value.status))
  );
}
export const authApi = {
  login: (body: Credentials, signal?: AbortSignal) =>
    request<LoginResult>(
      "/auth/login",
      200,
      (v): v is LoginResult =>
        record(v) &&
        typeof v.message === "string" &&
        ((typeof v.access_token === "string" &&
          v.onboarding_token === undefined) ||
          (typeof v.onboarding_token === "string" &&
            v.access_token === undefined)) &&
        user(v.user),
      { body, signal },
    ),
  register: (body: Registration, signal?: AbortSignal) =>
    request<RegisterResult>(
      "/auth/register",
      201,
      (v): v is RegisterResult =>
        record(v) &&
        typeof v.message === "string" &&
        user(v.user) &&
        "createdAt" in v.user &&
        typeof v.user.createdAt === "string",
      { body, signal },
    ),
  me: (token: string, signal?: AbortSignal) =>
    request<Identity>(
      "/auth/me",
      200,
      (v): v is Identity =>
        record(v) &&
        typeof v.userId === "string" &&
        typeof v.email === "string" &&
        role(v.role),
      { token, signal },
    ),
};
