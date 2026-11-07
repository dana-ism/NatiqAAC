import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "../../shared/api";
import { authApi } from "./api";
import { SessionContext, type Session } from "./session-context";
import type { Credentials, Identity } from "./types";
import { expiresAt } from "./validation";

export function SessionProvider({ children }: { children: ReactNode }) {
  const token = useRef<string | null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<Session["status"]>("anonymous");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState<unknown>(null);

  const cancelPending = useCallback(() => {
    generation.current++;
    active.current?.abort();
    clearTimeout(expiryTimer.current);
  }, []);

  const clear = useCallback(
    (message = "") => {
      cancelPending();
      token.current = null;
      setIdentity(null);
      setFailure(null);
      setStatus("anonymous");
      setNotice(message);
    },
    [cancelPending],
  );

  const verify = useCallback(
    async (candidate: string, run: number, signal: AbortSignal) => {
      if (expiresAt(candidate) <= Date.now()) {
        clear("انتهت جلستك. سجّل الدخول مجددًا.");
        return false;
      }
      try {
        const current = await authApi.me(candidate, signal);
        if (run !== generation.current) return false;
        if (expiresAt(candidate) <= Date.now()) {
          clear("انتهت جلستك. سجّل الدخول مجددًا.");
          return false;
        }
        setIdentity(current);
        setFailure(null);
        setStatus("authenticated");
        return true;
      } catch (error) {
        if (run !== generation.current) return false;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          clear("انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجددًا.");
          return false;
        } else {
          setIdentity(null);
          setFailure(error);
          setStatus("unavailable");
          return true;
        }
      }
    },
    [clear],
  );

  const login = useCallback(
    async (values: Credentials, signal?: AbortSignal) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const run = ++generation.current;
      const requestSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const result = await authApi.login(values, requestSignal);
      if (run !== generation.current || requestSignal.aborted) return false;
      const expiry = expiresAt(result.access_token);
      if (expiry <= Date.now() || expiry - Date.now() > 24 * 60 * 60 * 1000)
        throw new ApiError(200, "contract");
      token.current = result.access_token;
      setNotice("");
      setIdentity(null);
      setStatus("checking");
      clearTimeout(expiryTimer.current);
      expiryTimer.current = setTimeout(
        () => clear("انتهت جلستك. سجّل الدخول مجددًا."),
        expiry - Date.now(),
      );
      return verify(result.access_token, run, requestSignal);
    },
    [clear, verify],
  );

  const retry = useCallback(async () => {
    const candidate = token.current;
    if (!candidate) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const run = ++generation.current;
    setIdentity(null);
    setStatus("checking");
    await verify(candidate, run, controller.signal);
  }, [verify]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible" && token.current) void retry();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      cancelPending();
    };
  }, [retry, cancelPending]);

  return (
    <SessionContext.Provider
      value={{
        status,
        identity,
        notice,
        failure,
        login,
        retry,
        signOut: () => clear("تم تسجيل الخروج من هذا المتصفح."),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
