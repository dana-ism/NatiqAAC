import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { useI18n } from "../../i18n/context";
import { record } from "../../shared/api";
import { ErrorAlert } from "../../shared/Feedback";
import { AdminIcon } from "./AdminIcons";
function summary(v: unknown): v is { pendingCount: number } {
  return (
    record(v) &&
    Number.isSafeInteger(v.pendingCount) &&
    (v.pendingCount as number) >= 0
  );
}
export function AdminPage() {
  const { t, locale } = useI18n();
  const account = useOutletContext<{ email: string; role: "ADMIN" }>(),
    session = useSession();
  const load = useRef(session.authenticatedGet);
  const [count, setCount] = useState<number | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load
      .current(
        "/admin/specialist-applications/summary",
        summary,
        controller.signal,
      )
      .then((v) => {
        if (!controller.signal.aborted) setCount(v.pendingCount);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setFailure(e);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <div className="admin-page-heading">
        <p className="admin-eyebrow">{t("admin.workspace")}</p>
        <h1>{t("admin.title")}</h1>
        <p>{t("admin.overviewIntro")}</p>
      </div>
      <div className="admin-overview-grid">
        <section
          className="admin-attention admin-panel"
          aria-labelledby="attention-title"
        >
          <div className="admin-panel-heading">
            <span className="admin-icon-tile">
              <AdminIcon name="applications" />
            </span>
            <span className="admin-eyebrow">{t("admin.priority")}</span>
          </div>
          <h2 id="attention-title">{t("admin.pendingTitle")}</h2>
          <div
            className="admin-pending-count"
            aria-live="polite"
            aria-busy={count === null && !failure}
          >
            {failure ? (
              <span className="admin-count-unavailable">
                {t("admin.countUnavailable")}
              </span>
            ) : count === null ? (
              <span className="admin-skeleton" aria-label={t("auth.wait")} />
            ) : (
              <>
                <strong>{new Intl.NumberFormat(locale).format(count)}</strong>
                <span>{t("admin.waitingReview")}</span>
              </>
            )}
          </div>
          {failure ? (
            <>
              <ErrorAlert error={failure} />
              <button
                className="admin-text-button"
                onClick={() => {
                  setFailure(null);
                  setCount(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t("session.retry")}
              </button>
            </>
          ) : (
            <p>{t(count === 0 ? "admin.noPending" : "admin.reviewHelp")}</p>
          )}
          <Link
            className="admin-button"
            to="/admin/specialist-applications?status=PENDING_REVIEW"
          >
            {t("admin.reviewCta")}
            <AdminIcon className="admin-directional" name="arrow" />
          </Link>
          <Link className="admin-text-link" to="/admin/specialist-applications">
            {t("admin.viewAll")}
          </Link>
        </section>
        <section
          className="admin-account admin-panel"
          aria-labelledby="admin-account-title"
        >
          <div className="admin-panel-heading">
            <span className="admin-icon-tile">
              <AdminIcon name="shield" />
            </span>
            <span className="admin-eyebrow">{t("admin.currentAccount")}</span>
          </div>
          <h2 id="admin-account-title">{t("admin.accountTitle")}</h2>
          <dl>
            <dt>{t("auth.email")}</dt>
            <dd className="admin-email" dir="ltr">
              {account.email}
            </dd>
          </dl>
          <p className="admin-account-note">{t("admin.accountHelp")}</p>
        </section>
      </div>
      <section className="admin-workflow" aria-labelledby="workflow-title">
        <div>
          <p className="admin-eyebrow">{t("admin.reviewWorkflow")}</p>
          <h2 id="workflow-title">{t("admin.reviewThoughtfully")}</h2>
        </div>
        <ol>
          {(
            [
              "admin.stepRead",
              "admin.stepDocument",
              "admin.stepDecide",
            ] as const
          ).map((key, index) => (
            <li key={key}>
              <span aria-hidden="true">
                {new Intl.NumberFormat(locale).format(index + 1)}
              </span>
              <p>{t(key)}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="admin-guidance">
        <section>
          <AdminIcon name="shield" />
          <div>
            <h2>{t("admin.privacyTitle")}</h2>
            <p>{t("admin.privateDocuments")}</p>
          </div>
        </section>
        <section>
          <AdminIcon name="document" />
          <div>
            <h2>{t("admin.traceableTitle")}</h2>
            <p>{t("admin.traceableHelp")}</p>
          </div>
        </section>
      </div>
    </>
  );
}
