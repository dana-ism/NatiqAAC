import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { RegistrationPage } from "./RegistrationPage";
import { useI18n } from "../../i18n/context";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { ApiError } from "../../shared/api";
import "./account.css";
export { AdminApplicationsPage } from "../admin/AdminApplicationsPage";
import { useAccountCopy } from "./account.messages";
import { SocialButtons } from "./SocialButtons";
import {
  accountApi,
  applicationDetails,
  messageResult,
  onboardingResult,
  type ApplicationDetails,
  type Onboarding,
} from "./account.api";

function useAccountSession() {
  return useSession();
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="auth-card account-card" aria-labelledby="account-title">
      <h2 id="account-title">{title}</h2>
      {children}
    </section>
  );
}

export function AccountTypePage() {
  const c = useAccountCopy();
  const { t } = useI18n();
  return (
    <Card title={c("account.choose")}>
      <p className="form-intro">{c("account.chooseHelp")}</p>
      <div className="account-options">
        <Link className="primary-button" to="/register/parent">
          {c("account.parent")}
        </Link>
        <Link className="primary-button" to="/register/specialist">
          {c("account.specialist")}
        </Link>
      </div>
      <p className="switch-copy">
        <Link to="/login">{t("auth.signInLink")}</Link>
      </p>
    </Card>
  );
}

export function AccountConnectionsPage() {
  const session = useSession();
  const { t } = useI18n();
  const c = useAccountCopy();
  const location = useLocation();
  const navigate = useNavigate();
  const connected =
    location.state?.linkedProvider === "GOOGLE" ||
    location.state?.linkedProvider === "FACEBOOK";
  return (
    <Card title={t("account.connections")}>
      <p className="form-intro">{t("account.connectionsHelp")}</p>
      {session.status === "unavailable" && (
        <>
          <ErrorAlert error={session.failure} />
          <button
            type="button"
            className="primary-button"
            onClick={() => void session.retry()}
          >
            {t("session.retry")}
          </button>
        </>
      )}
      {connected && (
        <p className="alert success-alert" role="status">
          {c("account.linkedProvider")}
        </p>
      )}
      <SocialButtons
        intent="link"
        disabled={
          session.status === "checking" || session.status === "unavailable"
        }
        onStageChange={(active) => {
          if (active && connected)
            navigate("/account/connections", { replace: true, state: null });
        }}
      />
      <p className="switch-copy">
        <Link to="/home">{t("title.home")}</Link>
      </p>
    </Card>
  );
}

export function ParentRegistrationPage() {
  return <RegistrationPage specialist={false} />;
}
export function SpecialistRegistrationPage() {
  return <RegistrationPage specialist />;
}
export function VerificationPendingPage() {
  const c = useAccountCopy();
  const { t, locale } = useI18n();
  const location = useLocation();
  const session = useSession();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [check, setCheck] = useState<
    "idle" | "checking" | "pending" | "verified"
  >("idle");
  const [until, setUntil] = useState<number>(
    typeof location.state?.cooldownUntil === "number"
      ? location.state.cooldownUntil
      : 0,
  );
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  async function checkVerified() {
    if (lock.current) return;
    if (session.status !== "onboarding" && session.status !== "authenticated") {
      navigate("/login");
      return;
    }
    lock.current = true;
    setCheck("checking");
    setFailure(null);
    setDone(false);
    try {
      const me = await session.authenticatedGet(
        "/auth/onboarding/me",
        onboardingResult,
      );
      if (me.emailVerified) {
        if (me.role === "SPECIALIST")
          navigate("/application-status", { replace: true });
        else setCheck("verified");
      } else setCheck("pending");
    } catch (error) {
      setFailure(error);
      setCheck("idle");
    } finally {
      lock.current = false;
    }
  }
  const [email, setEmail] = useState(
    typeof location.state?.email === "string" ? location.state.email : "",
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  async function resend(e: FormEvent) {
    e.preventDefault();
    if (lock.current || Date.now() < until) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setDone(false);
    try {
      await accountApi.resend(
        (session.identity?.email ?? email).trim().toLowerCase(),
        locale,
      );
      setDone(true);
      setUntil(Date.now() + 60_000);
      setNow(Date.now());
    } catch (error) {
      setFailure(error);
      if (error instanceof ApiError && error.status === 429) {
        setUntil(
          Date.now() + Math.max(60, error.retryAfterSeconds ?? 60) * 1000,
        );
        setNow(Date.now());
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Card title={c("account.pending")}>
      <p className="form-intro">{c("account.pendingHelp")}</p>
      <p className="field-hint">{c("account.expiry")}</p>
      {location.state?.setupError && (
        <p role="alert" className="alert info-alert">
          {c("account.setupIncomplete")}
        </p>
      )}
      {location.state?.emailSent === false && (
        <p role="status" className="alert info-alert">
          {c("account.notSent")}
        </p>
      )}
      <ErrorAlert error={failure} />
      {check === "pending" && (
        <p role="status" className="alert info-alert">
          {c("account.stillPending")}
        </p>
      )}
      {check === "verified" ? (
        <>
          <p role="status" className="alert success-alert">
            {c("account.verified")}
          </p>
          <button
            className="primary-button"
            onClick={() => {
              session.signOut();
              navigate("/login");
            }}
          >
            {t("auth.signInLink")}
          </button>
        </>
      ) : (
        <button
          className="primary-button"
          disabled={busy || check === "checking"}
          onClick={() => void checkVerified()}
        >
          {check === "checking" ? t("auth.wait") : c("account.checkVerified")}
        </button>
      )}
      {session.status !== "onboarding" &&
        session.status !== "authenticated" && (
          <p className="field-hint">{c("account.signInToCheck")}</p>
        )}
      {done && (
        <p role="status" className="alert success-alert">
          {c("account.resendDone")}
        </p>
      )}
      <form onSubmit={(e) => void resend(e)} aria-busy={busy}>
        <div className="field">
          <label htmlFor="resend-email">{t("auth.email")}</label>
          <div className="input-wrap">
            <input
              id="resend-email"
              type="email"
              dir="ltr"
              maxLength={254}
              required
              autoComplete="email"
              value={session.identity?.email ?? email}
              readOnly={!!session.identity?.email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <button
          className="text-button"
          disabled={busy || check === "checking" || remaining > 0}
        >
          {busy ? t("auth.wait") : c("account.resend")}
        </button>
      </form>
      {remaining > 0 && (
        <p className="field-hint" aria-live="off">
          {t("account.cooldown", { seconds: remaining })}
        </p>
      )}
      {session.identity?.role === "SPECIALIST" && (
        <p className="switch-copy">
          <Link to="/application-status">{c("account.completeProfile")}</Link>
        </p>
      )}
      <p className="switch-copy">
        <Link to="/login" onClick={() => session.signOut()}>
          {t("auth.signInLink")}
        </Link>
      </p>
    </Card>
  );
}

// The fragment is removed immediately and never persisted. Only an explicit
// user action consumes the token; opening the link alone performs no API call.
export function VerificationResultPage() {
  const c = useAccountCopy();
  const session = useSession();
  const { t } = useI18n();
  const token = useRef<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (value) token.current = value;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  async function verify() {
    if (lock.current || done) return;
    if (!token.current) {
      setMissing(true);
      return;
    }
    setBusy(true);
    lock.current = true;
    setFailure(null);
    try {
      await accountApi.verify(token.current);
      token.current = null;
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Card title={c("account.pending")}>
      <p className="form-intro">{c("account.confirmHelp")}</p>
      {failure instanceof ApiError && failure.status === 400 ? (
        <p role="alert" className="alert error-alert">
          {c("account.invalidLink")}
        </p>
      ) : (
        <ErrorAlert error={failure} />
      )}
      {missing && <p role="alert">{c("account.invalidLink")}</p>}
      {done ? (
        <p className="alert success-alert" role="status">
          {c("account.verified")}
        </p>
      ) : (
        <button
          className="primary-button"
          onClick={() => void verify()}
          disabled={busy}
        >
          {busy ? t("auth.wait") : c("account.confirm")}
        </button>
      )}
      <p className="switch-copy">
        <Link to="/verification-pending">{c("account.resend")}</Link> ·{" "}
        <Link to="/login" onClick={() => session.signOut()}>
          {t("auth.signInLink")}
        </Link>
      </p>
    </Card>
  );
}

export function ApplicationStatusPage() {
  const c = useAccountCopy();
  const { t } = useI18n();
  const session = useAccountSession();
  const location = useLocation();
  const api = useRef(session);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [application, setApplication] = useState<ApplicationDetails | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState(false);
  const actionLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const me = await api.current.authenticatedGet(
          "/auth/onboarding/me",
          onboardingResult,
          controller.signal,
        );
        const app =
          me.role === "SPECIALIST"
            ? await api.current.authenticatedGet(
                "/specialist/application/me",
                applicationDetails,
                controller.signal,
              )
            : null;
        if (!controller.signal.aborted) {
          setOnboarding(me);
          setApplication(app);
        }
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error);
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  async function action(upload: boolean) {
    if (actionLock.current) return;
    setFailure(null);
    setNotice("");
    if (
      upload &&
      (!file || file.size > 5 * 1024 * 1024 || file.type !== "application/pdf")
    ) {
      setFileError(true);
      return;
    }
    setBusy(true);
    actionLock.current = true;
    try {
      if (upload) {
        const form = new FormData();
        form.append("document", file!);
        await api.current.uploadDocument(form);
        setNotice(c("account.uploaded"));
      } else {
        const result = await api.current.authenticatedPost(
          "/specialist/application/submit",
          {},
          messageResult,
        );
        setNotice(
          c(
            result.message === "Application saved; email verification required"
              ? "account.savedPending"
              : "account.submitted",
          ),
        );
      }
      setAttempt((n) => n + 1);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }
  const canSignIn =
    session.status === "onboarding" &&
    onboarding?.emailVerified &&
    (onboarding.role === "PARENT" || application?.status === "APPROVED");
  return (
    <Card title={c("account.status")}>
      {location.state?.setupError && (
        <p role="alert" className="alert info-alert">
          {c("account.setupIncomplete")}
        </p>
      )}
      <ErrorAlert error={failure} />
      {!!failure && (
        <button
          className="text-button"
          onClick={() => {
            setFailure(null);
            setAttempt((n) => n + 1);
          }}
        >
          {t("session.retry")}
        </button>
      )}
      {!onboarding && !failure && <Loading />}
      {notice && (
        <p role="status" className="alert success-alert">
          {notice}
        </p>
      )}
      {onboarding && (
        <>
          <p className="form-intro">
            {c(
              onboarding.emailVerified
                ? "account.emailVerified"
                : "account.emailNeeded",
            )}
          </p>
          {!onboarding.emailVerified && (
            <Link
              to="/verification-pending"
              state={{ email: onboarding.email }}
            >
              {c("account.resend")}
            </Link>
          )}
          {!onboarding.emailVerified && (
            <button
              className={
                application?.submittedAt ? "primary-button" : "text-button"
              }
              disabled={busy}
              onClick={() => {
                setFailure(null);
                setNotice("");
                setAttempt((n) => n + 1);
              }}
            >
              {c("account.checkVerified")}
            </button>
          )}
          {application ? (
            <>
              <p className="alert info-alert" role="status">
                {c(
                  application.status === "DRAFT" && application.submittedAt
                    ? "account.savedPending"
                    : `account.${application.status}`,
                )}
              </p>
              <dl>
                <dt>{c("account.specialization")}</dt>
                <dd>{application.specialization}</dd>
                <dt>{c("account.qualification")}</dt>
                <dd>{application.qualification}</dd>
              </dl>
              {application.reviews.map(
                (r, i) => r.reason && <p key={i}>{r.reason}</p>,
              )}
              {application.status === "DRAFT" && (
                <>
                  {!application.hasDocument && (
                    <>
                      <label htmlFor="qualification-document">
                        {c("account.document")}
                      </label>
                      <p className="field-hint" id="document-help">
                        {c("account.documentHelp")}
                      </p>
                    </>
                  )}
                  {application.hasDocument && (
                    <p>{c("account.documentPresent")}</p>
                  )}
                  {!application.hasDocument && (
                    <>
                      <input
                        id="qualification-document"
                        type="file"
                        accept="application/pdf"
                        aria-describedby="document-help"
                        disabled={busy}
                        onChange={(e) => {
                          setFile(e.target.files?.[0] ?? null);
                          setFileError(false);
                        }}
                      />
                      {fileError && (
                        <p role="alert">{c("account.fileInvalid")}</p>
                      )}
                      <button
                        className="primary-button"
                        disabled={busy || !file}
                        onClick={() => void action(true)}
                      >
                        {c("account.upload")}
                      </button>
                    </>
                  )}
                  {!application.submittedAt && (
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        !application.hasDocument ||
                        !!application.submittedAt
                      }
                      onClick={() => void action(false)}
                    >
                      {c("account.submit")}
                    </button>
                  )}
                </>
              )}
            </>
          ) : onboarding.emailVerified && session.status === "onboarding" ? (
            <p className="alert success-alert" role="status">
              {c("account.verified")}
            </p>
          ) : session.status === "authenticated" ? (
            <Link to="/home">{t("title.home")}</Link>
          ) : null}
        </>
      )}
      <button
        className={canSignIn ? "primary-button" : "text-button"}
        onClick={session.signOut}
      >
        {t(canSignIn ? "auth.signInLink" : "home.signOut")}
      </button>
    </Card>
  );
}
