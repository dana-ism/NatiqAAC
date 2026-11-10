import { useI18n } from "../../i18n/context";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { AdminIcon } from "./AdminIcons";
import type { FutureAdminSection } from "./admin-sections";

const foundations = {
  "/admin/users": ["userDirectory", "userFilters", "userAccess"],
  "/admin/content": ["words", "pictures", "sounds", "symbols", "categories"],
  "/admin/admins": ["adminDirectory", "invitations", "adminAccess"],
  "/admin/audit-logs": ["auditContext", "auditTime", "auditReason"],
  "/admin/settings": ["workspaceSettings", "settingsSafety"],
} as const;

/** Visual foundations only: no records, mutations or implied backend integration. */
export function FutureModuleFoundation({
  section,
}: {
  section: FutureAdminSection;
}) {
  const { t } = useI18n();
  return (
    <>
      {section.path === "/admin/settings" && (
        <section
          className="admin-panel admin-language-setting"
          aria-labelledby="admin-language-title"
        >
          <div>
            <span className="admin-functional-label">
              {t("adminV2.availableNow")}
            </span>
            <h2 id="admin-language-title">{t("adminV2.languageSetting")}</h2>
            <p>{t("adminV2.languageSettingHelp")}</p>
          </div>
          <LanguageSwitcher />
        </section>
      )}
      <section
        className="admin-foundation"
        aria-labelledby="admin-foundation-title"
      >
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-foundation-title">{t("adminV2.plannedWorkspace")}</h2>
            <p>{t("adminV2.frontendOnlyHelp")}</p>
          </div>
          <span className="admin-foundation-label">
            {t("adminV2.frontendOnly")}
          </span>
        </div>
        <div className="admin-foundation-grid">
          {foundations[section.path].map((item) => (
            <article className="admin-panel admin-foundation-card" key={item}>
              <span className="admin-foundation-icon">
                <AdminIcon name={section.icon} />
              </span>
              <h3>{t(`adminV2.${item}`)}</h3>
              <p>{t(`adminV2.${item}Help`)}</p>
              <span className="admin-planned-label">
                {t("adminV2.inPreparation")}
              </span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
