import { useEffect, useRef, useState } from "react";
import { useSession } from "../auth/session-context";
import { useI18n } from "../../i18n/context";
import { AacCards } from "./AacCards";
import { dashboardResult, type AdminDashboard } from "./admin.api";
import {
  AdminStatistics,
  ImportantAlerts,
  RecentApplications,
  SpecialistVerificationPreview,
} from "./AdminOverviewSections";

export function AdminPage() {
  const { t } = useI18n();
  const session = useSession(),
    load = useRef(session.authenticatedGet);
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load
      .current(
        "/admin/specialist-applications/dashboard",
        dashboardResult,
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(error);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <header className="admin-greeting admin-page-heading">
        <div>
          <p className="admin-eyebrow">{t("admin.portal")}</p>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.overviewIntro")}</p>
        </div>
        <AacCards />
      </header>
      <AdminStatistics data={data} failure={failure} />
      <div className="admin-attention-grid">
        <ImportantAlerts
          data={data}
          failure={failure}
          retry={() => {
            setFailure(null);
            setData(null);
            setAttempt((n) => n + 1);
          }}
        />
        <SpecialistVerificationPreview data={data} failure={failure} />
      </div>
      <RecentApplications data={data} failure={failure} />
    </>
  );
}
