import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { validate, type FieldErrors } from "../auth/validation";
import { useI18n } from "../../i18n/context";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { ApiError } from "../../shared/api";
import "./account.css";
import { SocialButtons } from "./SocialButtons";
import { useAccountCopy } from "./account.messages";
import {
  accountApi,
  applicationDetails,
  applicationEnvelope,
  applicationList,
  messageResult,
  onboardingResult,
  type ApplicationDetails,
  type ApplicationSummary,
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

export function ParentRegistrationPage() {
  return <RegistrationPage specialist={false} />;
}
export function SpecialistRegistrationPage() {
  return <RegistrationPage specialist />;
}
function RegistrationPage({ specialist }: { specialist: boolean }) {
  const { t, locale } = useI18n();
  const c = useAccountCopy();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    specialization: "",
    qualification: "",
    summary: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [visible, setVisible] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = validate(values, true);
    setErrors(next);
    if (Object.keys(next).length) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    controller.current = new AbortController();
    try {
      const result = await accountApi.register(
        specialist ? "specialist" : "parent",
        {
          fullName: values.fullName.trim(),
          email: values.email.trim().toLowerCase(),
          password: values.password,
          locale,
          ...(specialist
            ? {
                specialization: values.specialization.trim(),
                qualification: values.qualification.trim(),
                ...(values.summary.trim()
                  ? { summary: values.summary.trim() }
                  : {}),
              }
            : {}),
        },
        controller.current.signal,
      );
      navigate("/verification-pending", {
        replace: true,
        state: {
          email: values.email.trim().toLowerCase(),
          emailSent: result.verification.emailSent,
        },
      });
    } catch (error) {
      if (!controller.current.signal.aborted) setFailure(error);
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  function field(
    name: keyof typeof values,
    label: string,
    type = "text",
    maxLength = 200,
  ) {
    const error = errors[name as keyof FieldErrors];
    return (
      <div className="field">
        <label htmlFor={`register-${name}`}>{label}</label>
        <div className="input-wrap">
          <input
            id={`register-${name}`}
            name={name}
            type={name === "password" && visible ? "text" : type}
            value={values[name]}
            onChange={(e) =>
              setValues((v) => ({ ...v, [name]: e.target.value }))
            }
            maxLength={maxLength}
            minLength={
              name === "specialization" || name === "qualification"
                ? 2
                : undefined
            }
            required
            disabled={busy}
            dir={name === "email" || name === "password" ? "ltr" : "auto"}
            autoComplete={
              name === "fullName"
                ? "name"
                : name === "email"
                  ? "email"
                  : name === "password"
                    ? "new-password"
                    : undefined
            }
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${name}-error`
                : name === "password"
                  ? "password-help"
                  : undefined
            }
          />
        </div>
        {error && (
          <p className="field-error" id={`${name}-error`} role="alert">
            {t(error)}
          </p>
        )}
      </div>
    );
  }
  return (
    <Card title={c(specialist ? "account.specialist" : "account.parent")}>
      <p className="form-intro">{c("account.pendingHelp")}</p>
      <ErrorAlert error={failure} context="register" />
      <form ref={form} onSubmit={(e) => void submit(e)} aria-busy={busy}>
        {field("fullName", t("auth.fullName"), "text", 100)}
        {field("email", t("auth.email"), "email", 254)}
        {field("password", t("auth.password"), "password", 72)}
        <p className="field-hint" id="password-help">
          {t("auth.passwordHint")}
        </p>
        <button
          className="text-button"
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {t(visible ? "auth.hidePassword" : "auth.showPassword")}
        </button>
        {specialist && (
          <>
            {field("specialization", c("account.specialization"), "text", 160)}
            {field("qualification", c("account.qualification"))}
            <div className="field">
              <label htmlFor="summary">{c("account.summary")}</label>
              <textarea
                id="summary"
                value={values.summary}
                maxLength={2000}
                disabled={busy}
                onChange={(e) =>
                  setValues((v) => ({ ...v, summary: e.target.value }))
                }
              />
            </div>
          </>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? t("auth.creating") : c("account.apply")}
        </button>
      </form>
      <SocialButtons
        intent="register"
        role={specialist ? "SPECIALIST" : "PARENT"}
        registration={{
          fullName: values.fullName,
          email: values.email,
          specialization: values.specialization,
          qualification: values.qualification,
          summary: values.summary,
          locale,
        }}
      />
      <p className="switch-copy">
        <Link to="/login">{t("auth.signInLink")}</Link>
      </p>
    </Card>
  );
}

export function VerificationPendingPage() {
  const c = useAccountCopy();
  const { t, locale } = useI18n();
  const location = useLocation();
  const [email, setEmail] = useState(
    typeof location.state?.email === "string" ? location.state.email : "",
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  async function resend(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setDone(false);
    try {
      await accountApi.resend(email.trim().toLowerCase(), locale);
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={c("account.pending")}>
      <p className="form-intro">{c("account.pendingHelp")}</p>
      {location.state?.emailSent === false && (
        <p role="status" className="alert info-alert">
          {c("account.notSent")}
        </p>
      )}
      <ErrorAlert error={failure} />
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <button className="primary-button" disabled={busy}>
          {busy ? t("auth.wait") : c("account.resend")}
        </button>
      </form>
      <p className="switch-copy">
        <Link to="/login">{t("auth.signInLink")}</Link>
      </p>
    </Card>
  );
}

// The fragment is removed immediately and never persisted. Only an explicit
// user action consumes the token; opening the link alone performs no API call.
export function VerificationResultPage() {
  const c = useAccountCopy();
  const { t } = useI18n();
  const token = useRef<string | null>(null);
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
    if (busy || done) return;
    if (!token.current) {
      setMissing(true);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await accountApi.verify(token.current);
      token.current = null;
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={c("account.pending")}>
      <p className="form-intro">{c("account.confirmHelp")}</p>
      <ErrorAlert error={failure} />
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
        <Link to="/login">{t("auth.signInLink")}</Link>
      </p>
    </Card>
  );
}

export function ApplicationStatusPage() {
  const c = useAccountCopy();
  const { t } = useI18n();
  const session = useAccountSession();
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
    if (busy) return;
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
    try {
      if (upload) {
        const form = new FormData();
        form.append("document", file!);
        await api.current.uploadDocument(form);
        setNotice(c("account.uploaded"));
      } else {
        await api.current.authenticatedPost(
          "/specialist/application/submit",
          {},
          messageResult,
        );
        setNotice(c("account.submitted"));
      }
      setAttempt((n) => n + 1);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={c("account.status")}>
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
              onboarding.emailVerified || onboarding.legacyAuthExempt
                ? "account.emailVerified"
                : "account.emailNeeded",
            )}
          </p>
          {!onboarding.emailVerified && !onboarding.legacyAuthExempt && (
            <Link
              to="/verification-pending"
              state={{ email: onboarding.email }}
            >
              {c("account.resend")}
            </Link>
          )}
          {application ? (
            <>
              <p className="alert info-alert" role="status">
                {c(`account.${application.status}`)}
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
                  <label htmlFor="qualification-document">
                    {c("account.document")}
                  </label>
                  <p className="field-hint" id="document-help">
                    {c("account.documentHelp")}
                  </p>
                  {application.hasDocument && (
                    <p>{c("account.documentPresent")}</p>
                  )}
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
                  {fileError && <p role="alert">{c("account.fileInvalid")}</p>}
                  <button
                    className="primary-button"
                    disabled={busy || !file}
                    onClick={() => void action(true)}
                  >
                    {c("account.upload")}
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      busy ||
                      !application.hasDocument ||
                      !(onboarding.emailVerified || onboarding.legacyAuthExempt)
                    }
                    onClick={() => void action(false)}
                  >
                    {c("account.submit")}
                  </button>
                </>
              )}
            </>
          ) : (
            <Link to="/home">{t("title.home")}</Link>
          )}
        </>
      )}
      <button className="text-button" onClick={session.signOut}>
        {t("home.signOut")}
      </button>
    </Card>
  );
}

export function AdminApplicationsPage() {
  const c = useAccountCopy();
  const { t } = useI18n();
  const session = useAccountSession();
  const api = useRef(session);
  const [applications, setApplications] = useState<ApplicationSummary[] | null>(
    null,
  );
  const [selected, setSelected] = useState<
    (ApplicationDetails & ApplicationSummary) | null
  >(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [notice, setNotice] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api.current
      .authenticatedGet(
        "/admin/specialist-applications",
        applicationList,
        controller.signal,
      )
      .then((v) => {
        if (!controller.signal.aborted) setApplications(v.applications);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(error);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (decision) confirmHeading.current?.focus();
  }, [decision]);
  async function details(id: string) {
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      const v = await api.current.authenticatedGet(
        `/admin/specialist-applications/${encodeURIComponent(id)}`,
        applicationEnvelope,
      );
      setSelected(v.application);
      setReason("");
      setDecision(null);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!selected || !decision || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.current.authenticatedPost(
        `/admin/specialist-applications/${encodeURIComponent(selected.id)}/${decision}`,
        decision === "reject" ? { reason: reason.trim() } : {},
        messageResult,
      );
      setDecision(null);
      setSelected(null);
      setNotice(c("account.decided"));
      setAttempt((n) => n + 1);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!selected || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const blob = await api.current.downloadDocument(
        `/admin/specialist-applications/${encodeURIComponent(selected.id)}/document`,
      );
      if (!(blob instanceof Blob)) throw new ApiError(200, "contract");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "qualification-document";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={c("account.applications")}>
      <Link to="/admin">{t("admin.overview")}</Link>
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
      {notice && (
        <p role="status" className="alert success-alert">
          {notice}
        </p>
      )}
      {busy && <Loading />}
      {selected ? (
        <>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setDecision(null);
            }}
          >
            {c("account.back")}
          </button>
          <h3 ref={detailHeading} tabIndex={-1}>
            {selected.fullName}
          </h3>
          <p dir="ltr">{selected.email}</p>
          <p>{c(`account.${selected.status}`)}</p>
          <dl>
            <dt>{c("account.specialization")}</dt>
            <dd>{selected.specialization}</dd>
            <dt>{c("account.qualification")}</dt>
            <dd>{selected.qualification}</dd>
            <dt>{c("account.summary")}</dt>
            <dd>{selected.summary}</dd>
          </dl>
          {selected.hasDocument ? (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void download()}
            >
              {c("account.download")}
            </button>
          ) : (
            <p>{c("account.noDocument")}</p>
          )}
          {selected.reviews.map((r, i) => (
            <p key={i}>{r.reason}</p>
          ))}
          {selected.status === "PENDING_REVIEW" &&
            (decision ? (
              <form onSubmit={(e) => void decide(e)}>
                <h3 ref={confirmHeading} tabIndex={-1}>
                  {c(
                    decision === "approve"
                      ? "account.confirmApprove"
                      : "account.confirmReject",
                  )}
                </h3>
                {decision === "reject" && (
                  <div className="field">
                    <label htmlFor="rejection-reason">
                      {c("account.reason")}
                    </label>
                    <textarea
                      id="rejection-reason"
                      required
                      minLength={10}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                )}
                <button
                  className="primary-button"
                  disabled={
                    busy || (decision === "reject" && reason.trim().length < 10)
                  }
                >
                  {c("account.confirmDecision")}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setDecision(null)}
                >
                  {c("account.cancel")}
                </button>
              </form>
            ) : (
              <div className="account-options">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => setDecision("approve")}
                >
                  {c("account.approve")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setDecision("reject")}
                >
                  {c("account.reject")}
                </button>
              </div>
            ))}
        </>
      ) : applications ? (
        applications.length ? (
          <ul className="account-application-list">
            {applications.map((a) => (
              <li key={a.id}>
                <h3>{a.fullName}</h3>
                <p>{a.specialization}</p>
                <p>{c(`account.${a.status}`)}</p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void details(a.id)}
                  aria-label={`${c("account.details")}: ${a.fullName}`}
                >
                  {c("account.details")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{c("account.empty")}</p>
        )
      ) : (
        !failure && <Loading />
      )}
    </Card>
  );
}
