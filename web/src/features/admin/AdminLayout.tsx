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
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("admin.navigation")}>
      <p className="admin-nav-label">{t("admin.workspace")}</p>
      <NavLink to="/admin" end onClick={onNavigate}>
        <AdminIcon name="overview" />
        {t("admin.overview")}
      </NavLink>
      <NavLink to="/admin/specialist-applications" onClick={onNavigate}>
        <AdminIcon name="applications" />
        {t("account.applications")}
      </NavLink>
    </nav>
  );
}
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
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 901px)");
    function resize() {
      if (media.matches && drawer.current?.open) {
        drawer.current.close();
        setNavigation(false);
      }
    }
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
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
    drawer.current?.close();
    setNavigation(false);
    toggle.current?.focus();
  }
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        {t("layout.skip")}
      </a>
      <aside className="admin-sidebar" aria-label={t("admin.navigation")}>
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
          onClick={() => {
            setNavigation(true);
            drawer.current?.showModal();
          }}
        >
          {t("admin.navigation")}
          <AdminIcon name={navigation ? "close" : "menu"} />
        </button>
        <Navigation />
        <div className="admin-sidebar-footer">
          <AdminIcon name="shield" />
          <span>
            {t("admin.workspaceLabel")}
            <small>NatiqAAC</small>
          </span>
        </div>
      </aside>
      <dialog
        ref={drawer}
        id="admin-navigation"
        className="admin-drawer"
        aria-label={t("admin.navigation")}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const controls =
            e.currentTarget.querySelectorAll<HTMLElement>("button, a[href]");
          const first = controls[0],
            last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeNavigation();
        }}
        onClose={() => setNavigation(false)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.target === e.currentTarget &&
            (e.clientX < rect.left ||
              e.clientX > rect.right ||
              e.clientY < rect.top ||
              e.clientY > rect.bottom)
          )
            closeNavigation();
        }}
      >
        <div className="admin-drawer-heading">
          <Mark />
          <strong>{t("brand.name")}</strong>
          <button
            autoFocus
            className="admin-drawer-close"
            aria-label={t("signature.closeNavigation")}
            onClick={closeNavigation}
          >
            <AdminIcon name="close" />
          </button>
        </div>
        {navigation && <Navigation onNavigate={closeNavigation} />}
      </dialog>
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
