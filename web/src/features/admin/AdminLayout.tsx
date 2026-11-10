import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { record } from "../../shared/api";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { Mark } from "../../shared/Icons";
import { useI18n } from "../../i18n/context";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { AdminIcon } from "./AdminIcons";
import "./admin.css";
type Account = { email: string; role: "ADMIN" };
function overview(v: unknown): v is { account: Account } {
  return (
    record(v) &&
    record(v.account) &&
    typeof v.account.email === "string" &&
    v.account.role === "ADMIN"
  );
}
export function AdminLayout() {
  const session = useSession(),
    load = useRef(session.authenticatedGet);
  const { t } = useI18n(),
    location = useLocation();
  const [account, setAccount] = useState<Account | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0),
    [navigation, setNavigation] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const applications = location.pathname === "/admin/specialist-applications";
  useEffect(() => {
    const controller = new AbortController();
    void load
      .current("/admin/overview", overview, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setAccount(v.account);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setFailure(e);
      });
    return () => controller.abort();
  }, [attempt]);
  function closeNavigation() {
    setNavigation(false);
    toggle.current?.focus();
  }
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        {t("layout.skip")}
      </a>
      <aside
        className="admin-sidebar"
        aria-label={t("admin.navigation")}
        onKeyDown={(e) => {
          if (e.key === "Escape" && navigation) {
            e.preventDefault();
            closeNavigation();
          }
        }}
      >
        <Link className="brand" to="/admin">
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
          ref={toggle}
          className="admin-menu-toggle"
          aria-expanded={navigation}
          aria-controls="admin-navigation"
          onClick={() => setNavigation(!navigation)}
        >
          {t("admin.navigation")}
          <AdminIcon name={navigation ? "close" : "menu"} />
        </button>
        <nav id="admin-navigation" className={navigation ? "is-open" : ""}>
          <p className="admin-nav-label">{t("admin.workspace")}</p>
          <NavLink
            to="/admin"
            end
            onClick={() => {
              if (navigation) closeNavigation();
            }}
          >
            <AdminIcon name="overview" />
            {t("admin.overview")}
          </NavLink>
          <NavLink
            to="/admin/specialist-applications"
            onClick={() => {
              if (navigation) closeNavigation();
            }}
          >
            <AdminIcon name="applications" />
            {t("account.applications")}
          </NavLink>
        </nav>
        <div className="admin-sidebar-footer">
          <AdminIcon name="shield" />
          <span>
            {t("admin.workspaceLabel")}
            <small>NatiqAAC</small>
          </span>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-header">
          <div className="admin-breadcrumb">
            <span>{t("admin.portal")}</span>
            <span aria-hidden="true">/</span>
            <strong>
              {t(applications ? "account.applications" : "admin.overview")}
            </strong>
          </div>
          <div className="admin-header-actions">
            <LanguageSwitcher />
            <span className="admin-header-divider" aria-hidden="true" />
            <button className="admin-signout" onClick={session.signOut}>
              <AdminIcon name="logout" />
              {t("home.signOut")}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="admin-main">
          {!account && !failure && (
            <div className="admin-loading">
              <Loading />
            </div>
          )}
          {failure ? (
            <section className="admin-panel admin-error">
              <h1>{t("admin.unavailable")}</h1>
              <ErrorAlert error={failure} />
              <button
                className="admin-button"
                onClick={() => {
                  setFailure(null);
                  setAccount(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t("session.retry")}
              </button>
            </section>
          ) : (
            account && <Outlet context={account} />
          )}
        </main>
        <footer className="admin-footer">
          <span>NatiqAAC</span>
          <span>{t("admin.footer")}</span>
        </footer>
      </div>
    </div>
  );
}
