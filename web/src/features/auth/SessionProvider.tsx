import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiBase, request } from "../../shared/api";
import { authApi } from "./api";
import { SessionContext, type Session } from "./session-context";
import type { Credentials, Identity, LoginResult } from "./types";
import { messageResult, onboardingResult } from "../account/account.api";
import { expiresAt } from "./validation";
import type { MessageKey } from "../../i18n/ar";

export function SessionProvider({ children }: { children: ReactNode }) {
  const token = useRef<string | null>(null);
  const onboarding = useRef(false);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<Session["status"]>("anonymous");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [notice, setNotice] = useState<MessageKey | "">("");
  const [failure, setFailure] = useState<unknown>(null);

  const cancelPending = useCallback(() => {
    generation.current++;
    active.current?.abort();
    clearTimeout(expiryTimer.current);
  }, []);

  const clear = useCallback(
    (message: MessageKey | "" = "") => {
      cancelPending();
      token.current = null;
      onboarding.current = false;
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
        clear("session.expired");
        return false;
      }
      try {
        const current = onboarding.current
          ? await request("/auth/onboarding/me", 200, onboardingResult, {
              token: candidate,
              signal,
            })
          : await authApi.me(candidate, signal);
        if (run !== generation.current) return false;
        if (expiresAt(candidate) <= Date.now()) {
          clear("session.expired");
          return false;
        }
        setIdentity(current);
        setFailure(null);
        setStatus(onboarding.current ? "onboarding" : "authenticated");
        return true;
      } catch (error) {
        if (run !== generation.current) return false;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          clear("error.session");
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

  const adoptSession = useCallback(
    async (result: LoginResult, signal?: AbortSignal) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const run = ++generation.current;
      const requestSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      if (run !== generation.current || requestSignal.aborted) return false;
      const candidate = result.access_token ?? result.onboarding_token;
      const expiry = expiresAt(candidate);
      if (expiry <= Date.now() || expiry - Date.now() > 24 * 60 * 60 * 1000)
        throw new ApiError(200, "contract");
      token.current = candidate;
      onboarding.current = !!result.onboarding_token;
      setNotice("");
      setIdentity(null);
      setStatus("checking");
      clearTimeout(expiryTimer.current);
      expiryTimer.current = setTimeout(
        () => clear("session.expired"),
        expiry - Date.now(),
      );
      return verify(candidate, run, requestSignal);
    },
    [clear, verify],
  );

  const login = useCallback(
    async (values: Credentials, signal?: AbortSignal) => {
      const run = ++generation.current;
      const result = await authApi.login(values, signal);
      if (run !== generation.current || signal?.aborted) return false;
      return adoptSession(result, signal);
    },
    [adoptSession],
  );

  const privateRequest = async <T,>(
    path: string,
    validate: (body: unknown) => body is T,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> => {
    const candidate = token.current;
    const run = generation.current;
    if (!candidate || expiresAt(candidate) <= Date.now()) {
      clear("session.expired");
      throw new ApiError(401);
    }
    try {
      const result = await request(path, 200, validate, {
        token: candidate,
        body,
        signal,
      });
      if (run !== generation.current) throw new ApiError(401);
      return result;
    } catch (error) {
      if (
        run === generation.current &&
        error instanceof ApiError &&
        (error.status === 401 || (error.status === 403 && !onboarding.current))
      )
        clear("error.session");
      throw error;
    }
  };

  const documentRequest = async (
    path: string,
    form?: FormData,
  ): Promise<Response> => {
    const candidate = token.current;
    const run = generation.current;
    if (!candidate || expiresAt(candidate) <= Date.now()) {
      clear("session.expired");
      throw new ApiError(401);
    }
    let response: Response;
    try {
      response = await fetch(apiBase() + path, {
        method: form ? "POST" : "GET",
        body: form,
        headers: { Authorization: `Bearer ${candidate}` },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (run !== generation.current) throw new ApiError(401);
    if (!response.ok) {
      if (
        response.status === 401 ||
        (response.status === 403 && !onboarding.current)
      )
        clear("error.session");
      throw new ApiError(response.status);
    }
    return response;
  };

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
        adoptSession,
        retry,
        signOut: () => clear("session.signedOut"),
        authenticatedGet: (path, validate, signal) =>
          privateRequest(path, validate, undefined, signal),
        authenticatedPost: (path, body, validate) =>
          privateRequest(path, validate, body),
        uploadDocument: async (form) => {
          const run = generation.current;
          const response = await documentRequest(
            "/specialist/application/document",
            form,
          );
          const body: unknown = await response.json();
          if (run !== generation.current) throw new ApiError(401);
          if (!messageResult(body)) throw new ApiError(200, "contract");
          return body;
        },
        downloadDocument: async (path) => {
          const run = generation.current;
          const response = await documentRequest(path);
          if (
            !response.headers.get("Content-Type")?.startsWith("application/pdf")
          )
            throw new ApiError(200, "contract");
          const blob = await response.blob();
          if (run !== generation.current) throw new ApiError(401);
          if (blob.size > 5 * 1024 * 1024) throw new ApiError(200, "contract");
          return blob;
        },
        authenticatedUpload: async (path, form, validate) => {
          const run = generation.current;
          const response = await documentRequest(path, form);
          const body: unknown = await response.json();
          if (run !== generation.current) throw new ApiError(401);
          if (!validate(body)) throw new ApiError(200, "contract");
          return body;
        },
        downloadImage: async (path) => {
          const run = generation.current;
          const response = await documentRequest(path);
          if (
            response.headers.get("Content-Type")?.split(";")[0].trim() !==
            "image/webp"
          )
            throw new ApiError(200, "contract");
          const blob = await response.blob();
          if (run !== generation.current) throw new ApiError(401);
          if (!blob.size || blob.size > 2 * 1024 * 1024)
            throw new ApiError(200, "contract");
          return blob;
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
