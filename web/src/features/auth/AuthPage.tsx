import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "./api";
import { useSession } from "./session-context";
import { validate, type FieldErrors } from "./validation";
import { Eye } from "../../shared/Icons";
import { ErrorAlert } from "../../shared/Feedback";
import type { Registration } from "./types";
import { useI18n } from "../../i18n/context";
import { SocialButtons } from "../account/SocialButtons";

export function AuthPage({ register = false }: { register?: boolean }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Registration>({
    email: "",
    password: "",
    fullName: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  if (session.status === "authenticated")
    return <Navigate to="/home" replace />;
  if (session.status === "onboarding")
    return <Navigate to="/application-status" replace />;
  const afterLogin =
    typeof location.state?.from === "string" && location.state.from === "/home"
      ? location.state.from
      : "/home";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next = validate(values, register);
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    try {
      if (register) {
        request.current = new AbortController();
        await authApi.register(
          {
            ...values,
            fullName: values.fullName.trim(),
            email: values.email.trim().toLowerCase(),
          },
          request.current.signal,
        );
        if (mounted.current)
          navigate("/login", { replace: true, state: { registered: true } });
      } else {
        request.current = new AbortController();
        const accepted = await session.login(
          {
            email: values.email.trim().toLowerCase(),
            password: values.password,
          },
          request.current.signal,
        );
        if (accepted && mounted.current)
          navigate(afterLogin, { replace: true });
      }
    } catch (error) {
      if (mounted.current) setFailure(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function field(
    name: keyof Registration,
    label: string,
    type: string,
    autoComplete: string,
  ) {
    const invalid = errors[name];
    return (
      <div className="field">
        <label htmlFor={name}>{label}</label>
        <div className={`input-wrap ${invalid ? "invalid" : ""}`}>
          <input
            id={name}
            name={name}
            type={name === "password" && visible ? "text" : type}
            autoComplete={autoComplete}
            dir={name === "fullName" ? "auto" : "ltr"}
            value={values[name]}
            onChange={(e) => {
              setValues((v) => ({ ...v, [name]: e.target.value }));
              setErrors((v) => ({ ...v, [name]: undefined }));
            }}
            required
            aria-invalid={!!invalid}
            aria-describedby={
              [
                invalid && `${name}-error`,
                name === "password" && register && "password-hint",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            placeholder={
              name === "email"
                ? t("auth.emailPlaceholder")
                : name === "fullName"
                  ? t("auth.namePlaceholder")
                  : t("auth.passwordPlaceholder")
            }
            disabled={busy}
          />
          {name === "password" && (
            <button
              type="button"
              className="password-toggle"
              aria-label={t(
                visible ? "auth.hidePassword" : "auth.showPassword",
              )}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
              disabled={busy}
            >
              <Eye hidden={!visible} />
            </button>
          )}
        </div>
        {name === "password" && register && (
          <p className="field-hint" id="password-hint">
            {t("auth.passwordHint")}
          </p>
        )}
        {invalid && (
          <p className="field-error" id={`${name}-error`} role="alert">
            {t(invalid)}
          </p>
        )}
      </div>
    );
  }
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="section-tag">
        {t(register ? "auth.registerTag" : "auth.loginTag")}
      </span>
      <h2 id="auth-title">
        {t(register ? "auth.registerTitle" : "auth.loginTitle")}
      </h2>
      <p className="form-intro">
        {t(register ? "auth.registerDescription" : "auth.loginDescription")}
      </p>
      <div className="auth-tabs" aria-label={t("auth.options")}>
        <Link to="/login" aria-current={!register ? "page" : undefined}>
          {t("auth.login")}
        </Link>
        <Link to="/register" aria-current={register ? "page" : undefined}>
          {t("auth.register")}
        </Link>
      </div>
      {!register && location.state?.registered && (
        <p className="alert success-alert" role="status">
          {t("auth.registered")}
        </p>
      )}
      {session.notice && (
        <p className="alert info-alert" role="status">
          {t(session.notice)}
        </p>
      )}
      <ErrorAlert error={failure} context={register ? "register" : "login"} />
      <form
        ref={form}
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-busy={busy}
      >
        {register && field("fullName", t("auth.fullName"), "text", "name")}
        {field("email", t("auth.email"), "email", "email")}
        {field(
          "password",
          t("auth.password"),
          "password",
          register ? "new-password" : "current-password",
        )}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />{" "}
              {t(register ? "auth.creating" : "auth.signingIn")}
            </>
          ) : (
            <>
              {t(register ? "auth.createParent" : "auth.login")}
              <span className="directional-arrow" aria-hidden="true">
                ←
              </span>
            </>
          )}
        </button>
        <p className="form-status" role="status">
          {busy ? t("auth.wait") : ""}
        </p>
      </form>
      {!register && <SocialButtons intent="login" />}
      <p className="switch-copy">
        {t(register ? "auth.already" : "auth.firstVisit")}{" "}
        <Link to={register ? "/login" : "/register"}>
          {t(register ? "auth.signInLink" : "auth.createLink")}
        </Link>
      </p>
      <div className="session-note">
        <svg
          width="18"
          height="20"
          viewBox="0 0 20 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="9" width="14" height="11" rx="3" />
          <path d="M6 9V6a4 4 0 0 1 8 0v3" />
          <path d="M10 13v3" />
        </svg>
        <p>
          {t("auth.temporary")}
          <br />
          {t("auth.reload")}
        </p>
      </div>
    </section>
  );
}
