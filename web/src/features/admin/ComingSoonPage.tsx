import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/context";
import { AdminIcon } from "./AdminIcons";
import type { FutureAdminSection } from "./admin-sections";
import { AacCards } from "./AacCards";
import { FutureModuleFoundation } from "./FutureModuleFoundation";

export function ComingSoonPage({ section }: { section: FutureAdminSection }) {
  const { t } = useI18n();
  return (
    <section className="admin-coming-page">
      <div className="admin-page-heading">
        <p className="admin-eyebrow">{t("admin.workspace")}</p>
        <h1>{t(section.title)}</h1>
      </div>
      <div className="admin-coming-panel admin-panel">
        <div className="admin-coming-symbol">
          <AdminIcon name={section.icon} />
        </div>
        <span className="admin-coming-label">{t("adminV2.comingSoon")}</span>
        <h2>{t("adminV2.inDevelopment")}</h2>
        <p>{t(section.description)}</p>
        <Link className="admin-button" to="/admin">
          <AdminIcon className="admin-back-arrow" name="arrow" />
          {t("adminV2.backOverview")}
        </Link>
        <AacCards />
      </div>
      <FutureModuleFoundation section={section} />
    </section>
  );
}
