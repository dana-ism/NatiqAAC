import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "./api";
import { useSession } from "./session-context";
import { validate, type FieldErrors } from "./validation";
import { Eye } from "../../shared/Icons";
import { ErrorAlert } from "../../shared/Feedback";
import type { Registration } from "./types";

export function AuthPage({ register = false }: { register?: boolean }) {
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
                ? "name@example.com"
                : name === "fullName"
                  ? "اسمك كما تفضّل أن نناديك"
                  : "••••••••"
            }
            disabled={busy}
          />
          {name === "password" && (
            <button
              type="button"
              className="password-toggle"
              aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
            8 أحرف على الأقل، وبحد أقصى 72 بايت. لا تُحذف المسافات من كلمة
            المرور.
          </p>
        )}
        {invalid && (
          <p className="field-error" id={`${name}-error`} role="alert">
            {invalid}
          </p>
        )}
      </div>
    );
  }
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="section-tag">
        {register ? "بداية جديدة" : "أهلًا بعودتك"}
      </span>
      <h2 id="auth-title">
        {register ? "مساحة لطفلك، تبدأ معك." : "سعيدون بوجودك هنا."}
      </h2>
      <p className="form-intro">
        {register
          ? "أنشئ حساب ولي أمر لتبدأ رحلتك مع ناطق."
          : "سجّل الدخول إلى حسابك في ناطق، ولنكمل معًا."}
      </p>
      <div className="auth-tabs" aria-label="خيارات الحساب">
        <Link to="/login" aria-current={!register ? "page" : undefined}>
          تسجيل الدخول
        </Link>
        <Link to="/register" aria-current={register ? "page" : undefined}>
          إنشاء حساب
        </Link>
      </div>
      {!register && location.state?.registered && (
        <p className="alert success-alert" role="status">
          تم إنشاء حسابك بنجاح. يمكنك الآن تسجيل الدخول.
        </p>
      )}
      {session.notice && (
        <p className="alert info-alert" role="status">
          {session.notice}
        </p>
      )}
      <ErrorAlert error={failure} context={register ? "register" : "login"} />
      <form
        ref={form}
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-busy={busy}
      >
        {register && field("fullName", "الاسم الكامل", "text", "name")}
        {field("email", "البريد الإلكتروني", "email", "email")}
        {field(
          "password",
          "كلمة المرور",
          "password",
          register ? "new-password" : "current-password",
        )}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />{" "}
              {register ? "جارٍ إنشاء الحساب…" : "جارٍ تسجيل الدخول…"}
            </>
          ) : (
            <>
              {register ? "إنشاء حساب ولي أمر" : "تسجيل الدخول"}
              <span aria-hidden="true">←</span>
            </>
          )}
        </button>
        <p className="form-status" role="status">
          {busy ? "يرجى الانتظار حتى تكتمل العملية." : ""}
        </p>
      </form>
      <p className="switch-copy">
        {register ? "لديك حساب بالفعل؟" : "هذه زيارتك الأولى؟"}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? "سجّل الدخول" : "أنشئ حساب ولي أمر"}
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
          جلستك مؤقتة في هذه النافذة.
          <br />
          تحديث الصفحة يتطلّب تسجيل الدخول مجددًا.
        </p>
      </div>
    </section>
  );
}
