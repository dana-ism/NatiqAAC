import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../i18n/context";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { useAdminProfile } from "./profile-context";
import { AccountInformation } from "./AdminProfilePage";

export function AdminAccountSettingsPage() {
  const { profile } = useAdminProfile();
  const { t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const id =
      location.hash === "#security"
        ? "security"
        : location.hash === "#preferences"
          ? "preferences"
          : null;
    if (id) {
      const section = document.getElementById(id);
      section?.focus();
      section?.scrollIntoView({ block: "start" });
    }
  }, [location.hash]);
  return (
    <>
      <header className="admin-page-heading">
        <p className="admin-eyebrow">{t("admin.portal")}</p>
        <h1>{t("profile.settings")}</h1>
        <p>{t("profile.settingsIntro")}</p>
      </header>
      <p className="admin-account-note">{t("profile.personalOnly")}</p>
      <div className="admin-account-settings-grid">
        <section
          className="admin-panel admin-account-panel"
          aria-labelledby="settings-profile"
        >
          <h2 id="settings-profile">{t("profile.myProfile")}</h2>
          <p>
            <bdi>{profile.fullName || t("profile.fallback")}</bdi>
          </p>
          <p>
            <bdi>{profile.email}</bdi>
          </p>
          <Link className="admin-button secondary" to="/admin/profile">
            {t("profile.edit")}
          </Link>
        </section>
        <section
          className="admin-panel admin-account-panel"
          id="preferences"
          tabIndex={-1}
          aria-labelledby="preferences-title"
        >
          <h2 id="preferences-title">{t("profile.preferences")}</h2>
          <h3>{t("profile.language")}</h3>
          <p>{t("profile.languageHelp")}</p>
          <LanguageSwitcher />
        </section>
        <section
          className="admin-panel admin-account-panel"
          id="security"
          tabIndex={-1}
          aria-labelledby="security-title"
        >
          <h2 id="security-title">{t("profile.security")}</h2>
          <h3>{t("profile.password")}</h3>
          <p>
            {t(
              profile.passwordEnabled
                ? "profile.passwordEnabled"
                : "profile.passwordDisabled",
            )}
          </p>
          <p className="admin-account-note">
            {t("profile.passwordUnavailable")}
          </p>
          <h3>{t("profile.connected")}</h3>
          <p>{t("profile.connectedHelp")}</p>
          <ul className="admin-provider-status">
            {(["GOOGLE", "FACEBOOK"] as const).map((provider) => (
              <li key={provider}>
                <span>{provider === "GOOGLE" ? "Google" : "Facebook"}</span>
                <span>
                  {t(
                    profile.connectedProviders.includes(provider)
                      ? "profile.connectedState"
                      : "profile.notConnected",
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p>{t("profile.linkHelp")}</p>
          <Link className="admin-button secondary" to="/account/connections">
            {t("account.connections")}
          </Link>
        </section>
        <section
          className="admin-panel admin-account-panel"
          aria-labelledby="settings-account"
        >
          <h2 id="settings-account">{t("profile.info")}</h2>
          <AccountInformation />
        </section>
      </div>
    </>
  );
}
