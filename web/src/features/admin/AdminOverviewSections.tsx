import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/context";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import { AdminIcon } from "./AdminIcons";
import type { AdminDashboard } from "./admin.api";
import { adminDate, adminNumber } from "./admin-format";

type Props = { data: AdminDashboard | null; failure: unknown };
export function SpecialistVerificationPreview({ data, failure }: Props) {
  const { t } = useI18n();
  const application =
    data?.recentApplications.find((a) => a.status === "PENDING_REVIEW") ??
    data?.recentApplications[0];
  return (
    <section
      className="admin-overview-section admin-verification"
      aria-labelledby="admin-verification-title"
    >
      <div className="admin-section-heading">
        <h2 id="admin-verification-title">{t("adminV2.verification")}</h2>
      </div>
      <div className="admin-panel admin-verification-card">
        {!data ? (
          failure ? (
            <p>{t("adminV2.dataUnavailable")}</p>
          ) : (
            <Loading />
          )
        ) : !application ? (
          <p>{t("adminV2.noRecentHelp")}</p>
        ) : (
          <>
            <div className="admin-verification-identity">
              <span className="admin-foundation-icon">
                <AdminIcon name="shield" />
              </span>
              <div>
                <strong>{application.fullName}</strong>
                <bdi className="admin-row-email">{application.email}</bdi>
              </div>
            </div>
            <span className={`admin-status status-${application.status}`}>
              {t(`account.${application.status}`)}
            </span>
            <dl>
              <div>
                <dt>{t("account.specialization")}</dt>
                <dd>{application.specialization}</dd>
              </div>
              <div>
                <dt>{t("account.qualification")}</dt>
                <dd>{application.qualification}</dd>
              </div>
            </dl>
            <p className="admin-verification-help">
              <AdminIcon name="document" />
              {t("adminV2.secureReviewHelp")}
            </p>
            <Link
              className="admin-button"
              to={`/admin/specialist-applications?application=${encodeURIComponent(application.id)}`}
            >
              {t("adminV2.openSecureReview")}
              <AdminIcon name="arrow" className="admin-directional" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
export function AdminStatistics({ data, failure }: Props) {
  const { t, locale } = useI18n();
  const metrics = [
    { key: "pendingCount", label: "adminV2.pending", icon: "clock" },
    { key: "approvedCount", label: "adminV2.approved", icon: "check" },
    { key: "rejectedCount", label: "adminV2.rejected", icon: "close" },
    { key: "totalCount", label: "adminV2.total", icon: "applications" },
  ] as const;
  return (
    <section className="admin-statistics" aria-label={t("adminV2.statistics")}>
      {metrics.map((metric) => (
        <article
          className={`admin-stat-card ${metric.key === "pendingCount" ? "is-priority" : ""}`}
          key={metric.key}
          data-stat={metric.key}
        >
          <div className="admin-stat-label">
            <h2>{t(metric.label)}</h2>
            <AdminIcon name={metric.icon} />
          </div>
          <div
            className={
              metric.key === "pendingCount"
                ? "admin-pending-count"
                : "admin-stat-value"
            }
            aria-busy={!data && !failure}
            aria-live="polite"
          >
            {data ? (
              <strong>{adminNumber(locale, data[metric.key])}</strong>
            ) : failure ? (
              <span className="admin-count-unavailable">
                {t("admin.countUnavailable")}
              </span>
            ) : (
              <span className="admin-skeleton" aria-label={t("auth.wait")} />
            )}
          </div>
          <p>
            {t(
              metric.key === "totalCount"
                ? "adminV2.totalHelp"
                : metric.key === "pendingCount"
                  ? "adminV2.pendingHelp"
                  : "adminV2.recordedDecisions",
            )}
          </p>
        </article>
      ))}
    </section>
  );
}

export function ImportantAlerts({
  data,
  failure,
  retry,
}: Props & { retry: () => void }) {
  const { t, locale } = useI18n();
  return (
    <section
      className="admin-overview-section"
      aria-labelledby="admin-alerts-heading"
    >
      <div className="admin-section-heading">
        <h2 id="admin-alerts-heading">{t("adminV2.alerts")}</h2>
      </div>
      {failure ? (
        <div className="admin-panel admin-data-error">
          <h3>{t("adminV2.dataUnavailable")}</h3>
          <ErrorAlert error={failure} />
          <button className="admin-secondary-button" onClick={retry}>
            {t("session.retry")}
          </button>
        </div>
      ) : !data ? (
        <div className="admin-alert-loading">
          <Loading />
        </div>
      ) : data.pendingCount > 0 ? (
        <div className="admin-priority-alert">
          <span className="admin-alert-icon">
            <AdminIcon name="alert" />
          </span>
          <div>
            <h3>{t("adminV2.reviewAlert")}</h3>
            <p>
              <strong>{adminNumber(locale, data.pendingCount)}</strong>{" "}
              {t("admin.waitingReview")} · {t("adminV2.reviewAlertHelp")}
            </p>
          </div>
          <Link
            className="admin-button"
            to="/admin/specialist-applications?status=PENDING_REVIEW"
          >
            {t("admin.reviewCta")}
            <AdminIcon name="arrow" className="admin-directional" />
          </Link>
        </div>
      ) : (
        <div className="admin-alert-empty">
          <AdminIcon name="check" />
          <div>
            <h3>{t("adminV2.noAlerts")}</h3>
            <p>{t("admin.noPending")}</p>
          </div>
          <Link className="admin-text-link" to="/admin/specialist-applications">
            {t("admin.viewAll")}
          </Link>
        </div>
      )}
    </section>
  );
}

export function RecentApplications({ data, failure }: Props) {
  const { t, locale } = useI18n();
  return (
    <section
      className="admin-overview-section"
      aria-labelledby="admin-recent-heading"
    >
      <div className="admin-section-heading">
        <div>
          <h2 id="admin-recent-heading">{t("adminV2.recent")}</h2>
          <p>{t("adminV2.recentHelp")}</p>
        </div>
        <Link className="admin-text-link" to="/admin/specialist-applications">
          {t("admin.viewAll")}
          <AdminIcon name="arrow" className="admin-directional" />
        </Link>
      </div>
      {!data ? (
        <div className="admin-panel admin-recent-empty">
          {failure ? <p>{t("adminV2.dataUnavailable")}</p> : <Loading />}
        </div>
      ) : data.recentApplications.length === 0 ? (
        <div className="admin-panel admin-recent-empty">
          <AdminIcon name="applications" />
          <h3>{t("adminV2.noRecent")}</h3>
          <p>{t("adminV2.noRecentHelp")}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-recent-table">
            <caption className="sr-only">{t("adminV2.recent")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.applicant")}</th>
                <th scope="col">{t("account.specialization")}</th>
                <th scope="col">{t("admin.submitted")}</th>
                <th scope="col">{t("admin.filterStatus")}</th>
                <th scope="col">
                  <span className="sr-only">{t("account.details")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentApplications.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.fullName}</strong>
                    <bdi className="admin-row-email">{a.email}</bdi>
                  </td>
                  <td data-label={t("account.specialization")}>
                    {a.specialization}
                  </td>
                  <td data-label={t("admin.submitted")}>
                    <time dateTime={a.submittedAt ?? undefined}>
                      {adminDate(locale, a.submittedAt!)}
                    </time>
                  </td>
                  <td>
                    <span className={`admin-status status-${a.status}`}>
                      {t(`account.${a.status}`)}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="admin-row-action"
                      to={`/admin/specialist-applications?application=${encodeURIComponent(a.id)}`}
                      aria-label={`${t(a.status === "PENDING_REVIEW" ? "adminV2.reviewRequest" : "adminV2.viewRequest")}: ${a.fullName}`}
                    >
                      {t(
                        a.status === "PENDING_REVIEW"
                          ? "adminV2.reviewRequest"
                          : "adminV2.viewRequest",
                      )}
                      <AdminIcon name="arrow" className="admin-directional" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
