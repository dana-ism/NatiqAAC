import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { record } from "../../shared/api";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { Mark } from "../../shared/Icons";
import { useI18n } from "../../i18n/context";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import "./admin.css";

type Overview = { account: { email: string; role: "ADMIN" } };
function overview(value: unknown): value is Overview {
  return (
    record(value) &&
    record(value.account) &&
    typeof value.account.email === "string" &&
    value.account.role === "ADMIN"
  );
}

export function AdminPage() {
  const session = useSession();
  const load = useRef(session.authenticatedGet);
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [navigation, setNavigation] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void load
      .current("/admin/overview", overview, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(error);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        {t("layout.skip")}
      </a>
      <aside className="admin-sidebar" aria-label={t("admin.navigation")}>
        <Link className="brand" to="/admin" aria-label={t("admin.title")}>
          <Mark />
          <span>
            <strong>
              {t("brand.name")}
              <span className="brand-dot">.</span>
            </strong>
            <span className="brand-caption">{t("admin.portal")}</span>
          </span>
        </Link>
        <button
          ref={navigationToggle}
          className="admin-menu-toggle"
          aria-expanded={navigation}
          aria-controls="admin-navigation"
          onClick={() => setNavigation(!navigation)}
        >
          {t("admin.navigation")}
          <span aria-hidden="true">☰</span>
        </button>
        <nav id="admin-navigation" className={navigation ? "is-open" : ""}>
          <p className="admin-nav-label">{t("admin.workspace")}</p>
          <Link
            to="/admin"
            aria-current="page"
            onClick={() => {
              if (navigation) navigationToggle.current?.focus();
              setNavigation(false);
            }}
          >
            <span aria-hidden="true">▦</span>
            {t("admin.overview")}
          </Link>
          <Link to="/admin/specialist-applications">
            {t("account.applications")}
          </Link>
          <p className="admin-sidebar-note">{t("admin.scope")}</p>
        </nav>
        <p className="admin-sidebar-footer">
          NatiqAAC <span aria-hidden="true">/</span> {t("admin.portal")}
        </p>
      </aside>
      <div className="admin-body">
        <header className="admin-header">
          <span className="admin-breadcrumb">
            {t("admin.portal")} <span aria-hidden="true">/</span>{" "}
            <strong>{t("admin.overview")}</strong>
          </span>
          <div className="admin-header-actions">
            <LanguageSwitcher />
            <button className="admin-signout" onClick={session.signOut}>
              {t("home.signOut")}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="admin-main">
          <div className="admin-page-heading">
            <span className="section-tag">{t("admin.workspace")}</span>
            <h1>{t("admin.title")}</h1>
            <p>{t("admin.intro")}</p>
          </div>
          {!data && !failure && <Loading />}
          {failure ? (
            <section className="admin-panel">
              <h2>{t("admin.unavailable")}</h2>
              <ErrorAlert error={failure} />
              <button
                className="primary-button"
                onClick={() => {
                  setFailure(null);
                  setData(null);
                  setAttempt(attempt + 1);
                }}
              >
                {t("session.retry")}
              </button>
            </section>
          ) : (
            data && (
              <>
                <section
                  className="admin-account admin-panel"
                  aria-labelledby="admin-account-title"
                >
                  <div className="admin-account-mark" aria-hidden="true">
                    <Mark />
                  </div>
                  <div>
                    <span className="section-tag">
                      {t("admin.currentAccount")}
                    </span>
                    <h2 id="admin-account-title">{t("admin.accountTitle")}</h2>
                    <p className="admin-email" dir="ltr">
                      {data.account.email}
                    </p>
                    <span className="role-badge">{t("role.ADMIN")}</span>
                  </div>
                  <span className="admin-access-badge">
                    <span aria-hidden="true">✓</span>{" "}
                    {t("admin.accessVerified")}
                  </span>
                </section>
                <div className="admin-guidance">
                  <section className="admin-panel">
                    <span className="admin-panel-icon" aria-hidden="true">
                      ◇
                    </span>
                    <h2>{t("admin.privacyTitle")}</h2>
                    <p>{t("admin.privacy")}</p>
                  </section>
                  <section className="admin-panel">
                    <span className="admin-panel-icon" aria-hidden="true">
                      ↗
                    </span>
                    <h2>{t("admin.foundationTitle")}</h2>
                    <p>{t("admin.foundation")}</p>
                  </section>
                </div>
                <section className="admin-session-note">
                  <h2>{t("admin.sessionTitle")}</h2>
                  <p>
                    {t("auth.reload")} {t("home.localSignOut")}
                  </p>
                </section>
              </>
            )
          )}
        </main>
        <footer className="admin-footer">{t("layout.footer")}</footer>
      </div>
    </div>
  );
}
