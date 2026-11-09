import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../auth/session-context";
import type { AuthUser } from "../auth/types";
import { useI18n } from "../../i18n/context";
import type { Locale } from "../../i18n/messages";
import { apiBase, record, request } from "../../shared/api";
import { ErrorAlert } from "../../shared/Feedback";
import { useAccountCopy } from "./account.messages";

type Provider = "GOOGLE" | "FACEBOOK";
type Signup = {
  fullName?: string;
  email?: string;
  specialization?: string;
  qualification?: string;
  summary?: string;
  locale?: Locale;
};
export type OAuthSessionResult = { message: string; user: AuthUser } & (
  | { access_token: string; onboarding_token?: never }
  | { onboarding_token: string; access_token?: never }
);
interface Props {
  intent: "login" | "register" | "link";
  role?: "PARENT" | "SPECIALIST";
  registration?: Signup;
}
interface Flow {
  popup: Window;
  verifier: string;
  provider: Provider;
  completionId?: string;
  controller: AbortController;
  cleanup(): void;
}

function oauthResult(v: unknown): v is OAuthSessionResult {
  return (
    record(v) &&
    typeof v.message === "string" &&
    record(v.user) &&
    typeof v.user.id === "string" &&
    typeof v.user.fullName === "string" &&
    typeof v.user.email === "string" &&
    ["PARENT", "SPECIALIST", "ADMIN"].includes(String(v.user.role)) &&
    ["ACTIVE", "PENDING", "SUSPENDED"].includes(String(v.user.status)) &&
    ((typeof v.access_token === "string" &&
      v.access_token.length > 0 &&
      v.onboarding_token === undefined) ||
      (typeof v.onboarding_token === "string" &&
        v.onboarding_token.length > 0 &&
        v.access_token === undefined))
  );
}
function base64url(value: Uint8Array): string {
  return btoa(Array.from(value, (n) => String.fromCharCode(n)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function signupFields(values: Signup, locale: Locale): Signup {
  return {
    locale:
      values.locale === "ar" || values.locale === "en" ? values.locale : locale,
    ...(values.fullName?.trim() ? { fullName: values.fullName.trim() } : {}),
    ...(values.email?.trim()
      ? { email: values.email.trim().toLowerCase() }
      : {}),
    ...(values.specialization?.trim()
      ? { specialization: values.specialization.trim() }
      : {}),
    ...(values.qualification?.trim()
      ? { qualification: values.qualification.trim() }
      : {}),
    ...(values.summary?.trim() ? { summary: values.summary.trim() } : {}),
  };
}

export function SocialButtons({ intent, role, registration = {} }: Props) {
  const { t, locale } = useI18n();
  const c = useAccountCopy();
  const navigate = useNavigate();
  const session = useSession() as ReturnType<typeof useSession> & {
    adoptSession(result: OAuthSessionResult): Promise<boolean>;
  };
  const labels = {
    google: c("account.oauthGoogle"),
    facebook: c("account.oauthFacebook"),
    canceled: c("account.oauthCanceled"),
    blocked: c("account.oauthBlocked"),
    failed: c("account.oauthFailed"),
    complete: c("account.oauthComplete"),
    continue: c("account.oauthContinue"),
    cancel: c("account.cancel"),
  };
  const active = useRef<Flow | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [completion, setCompletion] = useState(false);
  const [fields, setFields] = useState<Signup>({});
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cleanup();
      active.current = null;
    };
  }, []);
  function stop() {
    active.current?.cleanup();
    active.current = null;
    if (mounted.current) {
      setBusy(false);
      setCompletion(false);
    }
  }
  async function finish(flow: Flow, values: Signup) {
    if (active.current !== flow || !flow.completionId) return;
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      const result = await request("/auth/oauth/finish", 200, oauthResult, {
        body: {
          completionId: flow.completionId,
          verifier: flow.verifier,
          ...(intent === "register" ? signupFields(values, locale) : {}),
        },
        signal: flow.controller.signal,
      });
      if (!mounted.current || active.current !== flow) return;
      const accepted = await session.adoptSession(result);
      if (!mounted.current || active.current !== flow) return;
      stop();
      if (accepted) navigate("/home", { replace: true });
    } catch (error) {
      if (!flow.controller.signal.aborted && mounted.current) {
        setFailure(error);
        setBusy(false);
      }
    }
  }
  function start(provider: Provider) {
    if (active.current) return;
    setFailure(null);
    setNotice("");
    setCompletion(false);
    const popup = window.open(
      "about:blank",
      "_blank",
      "popup,width=520,height=700",
    );
    if (!popup) {
      setNotice(labels.blocked);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const flow: Flow = {
      popup,
      provider,
      verifier: "",
      controller,
      cleanup() {
        window.removeEventListener("message", receive);
        clearInterval(interval);
        clearTimeout(timeout);
        controller.abort();
        popup.close();
      },
    };
    active.current = flow;
    function cancel(message: string) {
      if (active.current !== flow) return;
      stop();
      if (mounted.current) setNotice(message);
    }
    async function receive(event: MessageEvent) {
      if (active.current !== flow || flow.completionId) return;
      let expectedOrigin: string;
      try {
        expectedOrigin = new URL(apiBase()).origin;
      } catch {
        cancel(labels.failed);
        return;
      }
      if (
        event.origin !== expectedOrigin ||
        event.source !== popup ||
        !record(event.data) ||
        event.data.type !== "natiqaac-oauth" ||
        Object.keys(event.data).some(
          (k) => !["type", "completionId", "error"].includes(k),
        )
      )
        return;
      if (event.data.error === true && event.data.completionId === undefined) {
        cancel(labels.failed);
        return;
      }
      if (
        event.data.error !== undefined ||
        typeof event.data.completionId !== "string" ||
        !/^[A-Za-z0-9_-]{16,160}$/.test(event.data.completionId)
      )
        return;
      flow.completionId = event.data.completionId;
      window.removeEventListener("message", receive);
      clearInterval(interval);
      clearTimeout(timeout);
      flow.popup.close();
      // Completion is short-lived even when the user needs to enter missing data.
      timeout = setTimeout(() => cancel(labels.canceled), 110_000);
      const initial = signupFields(registration, locale);
      const incomplete =
        intent === "register" &&
        (!initial.fullName ||
          !initial.email ||
          (role === "SPECIALIST" &&
            (!initial.specialization || !initial.qualification)));
      if (incomplete) {
        setFields(initial);
        setCompletion(true);
        setBusy(false);
      } else {
        await finish(flow, initial);
      }
    }
    window.addEventListener("message", receive);
    const interval = setInterval(() => {
      if (popup.closed) cancel(labels.canceled);
    }, 200);
    timeout = setTimeout(() => cancel(labels.canceled), 110_000);
    void (async () => {
      try {
        flow.verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = base64url(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(flow.verifier),
            ),
          ),
        );
        const validateAuthorization = (
          v: unknown,
        ): v is { authorizationUrl: string } =>
          record(v) && typeof v.authorizationUrl === "string";
        const result =
          intent === "link"
            ? await session.authenticatedPost(
                "/auth/oauth/link/start",
                { provider, challenge },
                validateAuthorization,
              )
            : await request(
                "/auth/oauth/start",
                200,
                (v): v is { authorizationUrl: string } =>
                  record(v) && typeof v.authorizationUrl === "string",
                {
                  body: {
                    provider,
                    intent,
                    ...(intent === "register" && role ? { role } : {}),
                    challenge,
                  },
                  signal: controller.signal,
                },
              );
        if (active.current !== flow || controller.signal.aborted) return;
        const url = new URL(result.authorizationUrl);
        const allowed =
          provider === "GOOGLE"
            ? ["accounts.google.com"]
            : ["www.facebook.com", "facebook.com"];
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          !allowed.includes(url.hostname) ||
          url.port
        ) {
          cancel(labels.failed);
          return;
        }
        popup.location.href = url.href;
      } catch (error) {
        if (!controller.signal.aborted && mounted.current) {
          stop();
          setFailure(error);
        }
      }
    })();
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy && active.current) void finish(active.current, fields);
  }
  function input(
    name: "fullName" | "email" | "specialization" | "qualification",
    label: string,
    required: boolean,
    maxLength: number,
  ) {
    return (
      <div className="field">
        <label htmlFor={`oauth-${name}`}>{label}</label>
        <div className="input-wrap">
          <input
            id={`oauth-${name}`}
            type={name === "email" ? "email" : "text"}
            value={fields[name] ?? ""}
            required={required}
            maxLength={maxLength}
            minLength={
              name === "specialization" || name === "qualification"
                ? 2
                : undefined
            }
            disabled={busy}
            autoComplete={
              name === "fullName"
                ? "name"
                : name === "email"
                  ? "email"
                  : undefined
            }
            dir={name === "email" ? "ltr" : "auto"}
            onChange={(e) =>
              setFields((v) => ({ ...v, [name]: e.target.value }))
            }
          />
        </div>
      </div>
    );
  }
  return (
    <div className="account-social">
      <ErrorAlert error={failure} />
      {notice && (
        <p className="alert info-alert" role="status">
          {notice}
        </p>
      )}
      {completion ? (
        <form onSubmit={submit} aria-busy={busy}>
          <h3>{labels.complete}</h3>
          {input("fullName", t("auth.fullName"), true, 100)}
          {input("email", t("auth.email"), true, 254)}
          {role === "SPECIALIST" && (
            <>
              {input("specialization", c("account.specialization"), true, 160)}
              {input("qualification", c("account.qualification"), true, 200)}
            </>
          )}
          <button className="primary-button" disabled={busy}>
            {labels.continue}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              stop();
              setNotice(labels.canceled);
            }}
          >
            {labels.cancel}
          </button>
        </form>
      ) : (
        <>
          <div className="account-options">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => start("GOOGLE")}
              style={{
                background: "#ffffff",
                color: "#1f1f1f",
                border: "1px solid #747775",
              }}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.75 3.27-7.95Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.87 0-5.31-1.94-6.18-4.55H2.16v2.84A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.82 14.09A6.6 6.6 0 0 1 5.47 12c0-.72.13-1.42.35-2.09V7.07H2.16A11 11 0 0 0 1 12c0 1.78.43 3.45 1.16 4.93l3.66-2.84Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1a11 11 0 0 0-9.84 6.07l3.66 2.84C6.69 7.3 9.13 5.38 12 5.38Z"
                />
              </svg>{" "}
              {labels.google}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => start("FACEBOOK")}
              style={{ background: "#0866ff", color: "#ffffff" }}
            >
              <span aria-hidden="true" style={{ fontWeight: 700 }}>
                f
              </span>{" "}
              {labels.facebook}
            </button>
          </div>
          {busy && <p role="status">{t("auth.wait")}</p>}
        </>
      )}
    </div>
  );
}
