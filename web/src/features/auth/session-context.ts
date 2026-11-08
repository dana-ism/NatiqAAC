import { createContext, useContext } from "react";
import type { Credentials, Identity } from "./types";
import type { MessageKey } from "../../i18n/ar";

export type Session = {
  status: "anonymous" | "checking" | "authenticated" | "unavailable";
  identity: Identity | null;
  notice: MessageKey | "";
  failure: unknown;
  login: (values: Credentials, signal?: AbortSignal) => Promise<boolean>;
  retry: () => Promise<void>;
  signOut: () => void;
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
