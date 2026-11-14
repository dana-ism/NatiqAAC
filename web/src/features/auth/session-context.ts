import { createContext, useContext } from "react";
import type { Credentials, Identity, LoginResult } from "./types";
import type { MessageKey } from "../../i18n/ar";

export type Session = {
  status:
    "anonymous" | "checking" | "authenticated" | "onboarding" | "unavailable";
  identity: Identity | null;
  notice: MessageKey | "";
  failure: unknown;
  login: (values: Credentials, signal?: AbortSignal) => Promise<boolean>;
  retry: () => Promise<void>;
  signOut: () => void;
  adoptSession: (result: LoginResult) => Promise<boolean>;
  authenticatedPost: <T>(
    path: string,
    body: unknown,
    validate: (body: unknown) => body is T,
  ) => Promise<T>;
  uploadDocument: (form: FormData) => Promise<{ message: string }>;
  downloadDocument: (path: string) => Promise<Blob>;
  authenticatedUpload: <T>(
    path: string,
    form: FormData,
    validate: (body: unknown) => body is T,
  ) => Promise<T>;
  downloadImage: (path: string) => Promise<Blob>;
  authenticatedGet: <T>(
    path: string,
    validate: (body: unknown) => body is T,
    signal?: AbortSignal,
  ) => Promise<T>;
};
export const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) throw new Error("Session provider is required");
  return context;
}
