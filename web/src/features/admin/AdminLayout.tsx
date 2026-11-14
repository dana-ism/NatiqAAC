import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { Mark } from "../../shared/Icons";
import { useI18n } from "../../i18n/context";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { AdminIcon } from "./AdminIcons";
import { adminSections } from "./admin-sections";
import "./admin.css";
import "./admin-experience-v2.css";
import "./admin-account.css";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { adminProfileResult, type AdminProfile } from "./profile.api";
import { AdminProfileContext } from "./profile-context";
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("admin.navigation")}>
      <p className="admin-nav-label">{t("admin.workspace")}</p>
      {adminSections.map((section) => (
        <NavLink key={section.path} to={section.path} end onClick={onNavigate}>
          <AdminIcon name={section.icon} />
          <span>{t(section.title)}</span>
          {section.comingSoon && (
            <span className="admin-nav-badge">{t("adminV2.comingSoon")}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
export function AdminLayout() {
  const session = useSession(),
    load = useRef(session.authenticatedGet);
  const { t } = useI18n(),
    location = useLocation();
  const [account, setAccount] = useState<AdminProfile | null>(null);
  const imageRequest = useRef(session.downloadImage);
  const [avatarAttempt, setAvatarAttempt] = useState(0);
  const [avatar, setAvatar] = useState<{
    version: string;
    url: string | null;
    error: unknown;
  } | null>(null);
  const avatarVersion = account?.hasAvatar
    ? `${account.updatedAt}:${avatarAttempt}`
    : null;
  useEffect(() => {
    if (!avatarVersion) return;
    let cancelled = false;
    let url: string | undefined;
    void imageRequest
      .current("/admin/profile/avatar")
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setAvatar({ version: avatarVersion, url, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setAvatar({ version: avatarVersion, url: null, error });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [avatarVersion]);
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
  const personalTitle =
    location.pathname === "/admin/profile"
      ? "profile.myProfile"
      : location.pathname === "/admin/account-settings"
        ? "profile.settings"
        : null;
  const currentSection =
    adminSections.find((section) => section.path === location.pathname) ??
    adminSections[0];
  useEffect(() => {
    const controller = new AbortController();
    void load
      .current("/admin/profile", adminProfileResult, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setAccount(v);
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
    <AdminProfileContext.Provider
      value={
        account
          ? {
              profile: account,
              avatarUrl:
                avatarVersion && avatar?.version === avatarVersion
                  ? avatar.url
                  : null,
              avatarLoading:
                !!avatarVersion && avatar?.version !== avatarVersion,
              avatarFailure:
                avatarVersion && avatar?.version === avatarVersion
                  ? avatar.error
                  : null,
              retryAvatar: () => setAvatarAttempt((n) => n + 1),
              updateProfile: setAccount,
              reload: () => {
                setFailure(null);
                setAttempt((n) => n + 1);
              },
            }
          : null
      }
    >
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
              <span className="brand-caption">
                NatiqAAC · {t("admin.portal")}
              </span>
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
              <strong>{t(personalTitle ?? currentSection.title)}</strong>
            </div>
            <div className="admin-header-actions">
              <LanguageSwitcher />
              {account && (
                <AdminAccountMenu key={location.pathname + location.hash} />
              )}
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
    </AdminProfileContext.Provider>
  );
}
