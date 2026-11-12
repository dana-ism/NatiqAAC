import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/context";
import { ErrorAlert } from "../../shared/Feedback";
import type { MessageKey } from "../../i18n/ar";
import { Eye } from "../../shared/Icons";
import { useSession } from "../auth/session-context";
import { validate } from "../auth/validation";
import { accountApi, messageResult } from "./account.api";
import { useAccountCopy } from "./account.messages";
import { SocialButtons } from "./SocialButtons";

export function RegistrationPage({ specialist }: { specialist: boolean }) {
  const { t, locale } = useI18n();
  const c = useAccountCopy();
  const session = useSession();
  const navigate = useNavigate();
  const [stage, setStage] = useState<"identity" | "professional" | "social">(
    "identity",
  );
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    specialization: "",
    qualification: "",
    summary: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof typeof values | "document", MessageKey>>
  >({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [visible, setVisible] = useState({
    password: false,
    confirmPassword: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function transition(next: typeof stage) {
    setStage(next);
    setErrors({});
    setFailure(null);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const next: typeof errors = {};
    if (stage === "identity") {
      for (const [name, error] of Object.entries(validate(values, true)))
        next[name as keyof typeof values] = error!;
      if (values.confirmPassword !== values.password || !values.confirmPassword)
        next.confirmPassword = "account.passwordMismatch";
    } else {
      if (values.specialization.trim().length < 2)
        next.specialization = "account.professionalRequired";
      if (values.qualification.trim().length < 2)
        next.qualification = "account.professionalRequired";
      if (
        !file ||
        file.size === 0 ||
        file.size > 5 * 1024 * 1024 ||
        file.type !== "application/pdf"
      )
        next.document = "account.fileInvalid";
    }
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return;
    }
    if (specialist && stage === "identity") {
      transition("professional");
      return;
    }
    lock.current = true;
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
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
        request.signal,
      );
      // Registration is committed. Later failures must recover through the existing
      // account, never submit registration again or claim an upload succeeded.
      let setupError = false;
      try {
        const accepted = await session.login(
          { email: result.user.email, password: values.password },
          request.signal,
        );
        if (!accepted) setupError = true;
        else if (specialist && file) {
          const body = new FormData();
          body.append("document", file);
          await session.uploadDocument(body);
          await session.authenticatedPost(
            "/specialist/application/submit",
            {},
            messageResult,
          );
        }
      } catch {
        setupError = true;
      }
      if (!request.signal.aborted)
        navigate("/verification-pending", {
          replace: true,
          state: {
            email: result.user.email,
            emailSent: result.verification.emailSent,
            setupError,
            cooldownUntil: Date.now() + 60_000,
          },
        });
    } catch (error) {
      if (!request.signal.aborted) setFailure(error);
    } finally {
      lock.current = false;
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function field(
    name: Exclude<keyof typeof values, "summary">,
    label: string,
    maxLength: number,
  ) {
    const password = name === "password" || name === "confirmPassword";
    const error = errors[name];
    return (
      <div className="field">
        <label htmlFor={`register-${name}`}>{label}</label>
        <div className={`input-wrap ${error ? "invalid" : ""}`}>
          <input
            id={`register-${name}`}
            name={name}
            value={values[name]}
            required
            disabled={busy}
            type={
              password
                ? visible[name]
                  ? "text"
                  : "password"
                : name === "email"
                  ? "email"
                  : "text"
            }
            maxLength={maxLength}
            dir={password || name === "email" ? "ltr" : "auto"}
            autoComplete={
              password
                ? "new-password"
                : name === "fullName"
                  ? "name"
                  : name === "email"
                    ? "email"
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
            onChange={(e) => {
              setValues((v) => ({ ...v, [name]: e.target.value }));
              setErrors((v) => ({ ...v, [name]: undefined }));
            }}
          />
          {password && (
            <button
              type="button"
              className="password-toggle"
              disabled={busy}
              aria-label={`${t(visible[name] ? "auth.hidePassword" : "auth.showPassword")} — ${label}`}
              aria-pressed={visible[name]}
              onClick={() => setVisible((v) => ({ ...v, [name]: !v[name] }))}
            >
              <Eye hidden={!visible[name]} />
            </button>
          )}
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
    <section
      className="auth-card account-card onboarding-card"
      aria-labelledby="registration-title"
    >
      <Link className="text-button" to="/register">
        {c("account.changeRole")}
      </Link>
      <h2 id="registration-title" ref={heading} tabIndex={-1}>
        {c(specialist ? "account.specialist" : "account.parent")}
      </h2>
      <p className="form-intro">
        {c(specialist ? "account.specialistHelp" : "account.parentHelp")}
      </p>
      <SocialButtons
        disabled={busy}
        intent="register"
        role={specialist ? "SPECIALIST" : "PARENT"}
        onStageChange={(active) => transition(active ? "social" : "identity")}
      />
      {stage !== "social" && (
        <>
          <p className="method-divider">{c("account.emailMethod")}</p>
          {specialist && (
            <p className="step-label">
              {c(
                stage === "identity"
                  ? "account.stepIdentity"
                  : "account.stepProfessional",
              )}
            </p>
          )}
          <ErrorAlert error={failure} context="register" />
          <form
            ref={form}
            onSubmit={(e) => void submit(e)}
            noValidate
            aria-busy={busy}
          >
            {stage === "identity" ? (
              <>
                {field("fullName", t("auth.fullName"), 100)}
                {field("email", t("auth.email"), 254)}
                {field("password", t("auth.password"), 72)}
                <p className="field-hint" id="password-help">
                  {t("auth.passwordHint")}
                </p>
                {field("confirmPassword", c("account.confirmPassword"), 72)}
              </>
            ) : (
              <>
                {field("specialization", c("account.specialization"), 160)}
                {field("qualification", c("account.qualification"), 200)}
                <div className="field">
                  <label htmlFor="summary">{c("account.summary")}</label>
                  <textarea
                    id="summary"
                    maxLength={2000}
                    disabled={busy}
                    value={values.summary}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, summary: e.target.value }))
                    }
                  />
                </div>
                <label htmlFor="register-document">
                  {c("account.document")}
                </label>
                <p className="field-hint" id="document-help">
                  {c("account.documentHelp")}
                </p>
                <input
                  id="register-document"
                  name="document"
                  type="file"
                  accept="application/pdf"
                  required
                  disabled={busy}
                  aria-invalid={!!errors.document}
                  aria-describedby={
                    errors.document
                      ? "document-help document-error"
                      : "document-help"
                  }
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setErrors((v) => ({ ...v, document: undefined }));
                  }}
                />
                {errors.document && (
                  <p role="alert" className="field-error" id="document-error">
                    {t(errors.document)}
                  </p>
                )}
              </>
            )}
            <button className="primary-button" disabled={busy}>
              {busy
                ? t("auth.creating")
                : specialist && stage === "identity"
                  ? c("account.oauthContinue")
                  : c("account.apply")}
            </button>
            {stage === "professional" && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => transition("identity")}
              >
                {c("account.backIdentity")}
              </button>
            )}
          </form>
        </>
      )}
      <p className="switch-copy">
        <Link to="/login">{t("auth.signInLink")}</Link>
      </p>
    </section>
  );
}
