import { useEffect, useRef } from "react";
import { useSession } from "./session-context";

const roles = { PARENT: "ولي أمر", SPECIALIST: "أخصائي", ADMIN: "مسؤول" };
export function HomePage() {
  const { identity, signOut } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  if (!identity) return null;
  return (
    <section className="auth-card home-card">
      <span className="verified-badge">
        <span aria-hidden="true">✓</span> تم التحقق من الحساب
      </span>
      <h2 ref={heading} tabIndex={-1}>
        أهلًا بك في ناطق.
      </h2>
      <p className="form-intro">
        تم تسجيل دخولك بنجاح. هذه مساحة حسابك الأساسية.
      </p>
      <div className="identity-card">
        <span className="identity-icon" aria-hidden="true">
          ن
        </span>
        <div>
          <span className="section-tag">حسابك الحالي</span>
          <p dir="ltr" className="identity-email">
            {identity.email}
          </p>
          <span className="role-badge">{roles[identity.role]}</span>
        </div>
      </div>
      <dl className="identity-details">
        <dt>معرّف الحساب</dt>
        <dd dir="ltr">{identity.userId}</dd>
      </dl>
      <div className="home-note">
        <strong>البداية أصبحت جاهزة.</strong>
        <p>
          تعرض هذه الصفحة بيانات هويتك فقط. ستُضاف تجارب التطبيق في مراحل
          التطوير القادمة.
        </p>
      </div>
      <button className="primary-button" onClick={signOut}>
        تسجيل الخروج<span aria-hidden="true">←</span>
      </button>
      <p className="local-signout-note">
        تسجيل الخروج يمسح الجلسة من هذه النافذة فقط، ولا يلغي الرمز على الخادم.
      </p>
    </section>
  );
}
