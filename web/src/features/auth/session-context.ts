import { createContext, useContext } from "react";
import type { Credentials, Identity } from "./types";

export type Session = {
  status: "anonymous" | "checking" | "authenticated" | "unavailable";
  identity: Identity | null;
  notice: string;
  failure: unknown;
  login: (values: Credentials, signal?: AbortSignal) => Promise<boolean>;
  retry: () => Promise<void>;
  signOut: () => void;
};
export const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) throw new Error("Session provider is required");
  return context;
}
