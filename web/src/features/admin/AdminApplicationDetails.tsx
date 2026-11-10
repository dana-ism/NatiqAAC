import type { FormEvent, RefObject } from "react";
import { useI18n } from "../../i18n/context";
import type {
  ApplicationDetails,
  ApplicationSummary,
} from "../account/account.api";
import { AdminIcon } from "./AdminIcons";

type Props = {
  application: ApplicationDetails & ApplicationSummary;
  busy: boolean;
  decision: "approve" | "reject" | null;
  reason: string;
  heading: RefObject<HTMLHeadingElement | null>;
  confirmHeading: RefObject<HTMLHeadingElement | null>;
  date: (value: string | null) => string;
  onDownload: () => void;
  onDecision: (value: "approve" | "reject" | null) => void;
  onReason: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Presentation only. The page retains authenticated operations and mutation locking. */
export function AdminApplicationDetails({
  application: a,
  busy,
  decision,
  reason,
  heading,
  confirmHeading,
  date,
  onDownload,
  onDecision,
  onReason,
  onSubmit,
}: Props) {
  const { t, locale } = useI18n();
  return (
    <article className="admin-detail" aria-busy={busy}>
      <header className="admin-detail-header">
        <span className="admin-applicant-avatar" aria-hidden="true">
          <AdminIcon name="applications" />
        </span>
        <div className="admin-applicant-identity">
          <p className="admin-eyebrow">{t("admin.applicant")}</p>
          <h2 ref={heading} tabIndex={-1}>
            {a.fullName}
          </h2>
          <p className="admin-email" dir="ltr">
            {a.email}
          </p>
        </div>
        <span className={`admin-status status-${a.status}`}>
          {t(`account.${a.status}`)}
        </span>
      </header>
      <div className="admin-review-grid">
        <div className="admin-review-profile">
          <section
            className="admin-panel admin-profile-section"
            aria-labelledby="professional-heading"
          >
            <h3 id="professional-heading">
              <AdminIcon name="applications" />
              {t("signature.read")}
            </h3>
            <dl className="admin-detail-grid">
              <div>
                <dt>{t("account.specialization")}</dt>
                <dd>{a.specialization}</dd>
              </div>
              <div>
                <dt>{t("account.qualification")}</dt>
                <dd>{a.qualification}</dd>
              </div>
              <div>
                <dt>{t("admin.submitted")}</dt>
                <dd>{date(a.submittedAt)}</dd>
              </div>
              <div className="admin-detail-summary">
                <dt>{t("account.summary")}</dt>
                <dd>{a.summary || t("admin.noSummary")}</dd>
              </div>
            </dl>
          </section>
          <section
            className="admin-panel admin-document"
            aria-labelledby="document-heading"
          >
            <span className="admin-icon-tile">
              <AdminIcon name="document" />
            </span>
            <div>
              <h3 id="document-heading">{t("account.document")}</h3>
              <p className="admin-file-type">
                {t(a.hasDocument ? "signature.pdf" : "account.noDocument")}
              </p>
              {a.hasDocument && (
                <>
                  <span className="admin-document-availability">
                    <AdminIcon name="check" />
                    {t("signature.available")}
                  </span>
                  <p>{t("admin.documentPrivate")}</p>
                </>
              )}
            </div>
            {a.hasDocument && (
              <button
                className="admin-secondary-button"
                disabled={busy}
                onClick={onDownload}
              >
                <AdminIcon name="download" />
                {t("account.download")}
              </button>
            )}
          </section>
          {a.reviews.length > 0 && (
            <section
              className="admin-panel admin-review-history"
              aria-labelledby="review-history-heading"
            >
              <h3 id="review-history-heading">{t("admin.reviewHistory")}</h3>
              {a.reviews.map((r, i) => (
                <div key={i}>
                  <p>
                    <span className={`admin-status status-${r.decision}`}>
                      {r.decision === "APPROVED" || r.decision === "REJECTED"
                        ? t(`account.${r.decision}`)
                        : t("admin.reviewHistory")}
                    </span>
                    <time dateTime={r.createdAt}>{date(r.createdAt)}</time>
                  </p>
                  {r.reason && <p>{r.reason}</p>}
                </div>
              ))}
            </section>
          )}
        </div>
        <section
          className="admin-panel admin-decision-panel"
          aria-labelledby="decision-heading"
        >
          <span className="admin-icon-tile">
            <AdminIcon name="shield" />
          </span>
          <h3 id="decision-heading">{t("signature.decide")}</h3>
          <p>{t("signature.reviewContext")}</p>
          {a.status === "PENDING_REVIEW" ? (
            decision ? (
              <form
                className="admin-decision"
                onSubmit={onSubmit}
                aria-busy={busy}
              >
                <h4 ref={confirmHeading} tabIndex={-1}>
                  {t(
                    decision === "approve"
                      ? "account.confirmApprove"
                      : "account.confirmReject",
                  )}
                </h4>
                <p className="admin-decision-target">
                  {a.fullName} · <bdi>{a.email}</bdi>
                </p>
                <p>{t("admin.confirmTarget")}</p>
                {decision === "reject" && (
                  <div className="field">
                    <label htmlFor="rejection-reason">
                      {t("account.reason")}
                    </label>
                    <textarea
                      id="rejection-reason"
                      required
                      minLength={10}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => onReason(e.target.value)}
                      disabled={busy}
                      aria-describedby="reason-help reason-length"
                    />
                    <p id="reason-help" className="field-hint">
                      {t("admin.reasonHint")}
                    </p>
                    <p id="reason-length" className="admin-reason-length">
                      {new Intl.NumberFormat(locale).format(
                        reason.trim().length,
                      )}{" "}
                      / {new Intl.NumberFormat(locale).format(1000)}
                    </p>
                  </div>
                )}
                <div className="admin-action-row">
                  <button
                    className={
                      decision === "reject"
                        ? "admin-danger-button"
                        : "admin-button"
                    }
                    disabled={
                      busy ||
                      (decision === "reject" && reason.trim().length < 10)
                    }
                  >
                    {t("account.confirmDecision")}
                  </button>
                  <button
                    className="admin-secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onDecision(null);
                      heading.current?.focus();
                    }}
                  >
                    {t("account.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="admin-review-actions">
                <div className="admin-action-row">
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={() => onDecision("approve")}
                  >
                    <AdminIcon name="check" />
                    {t("account.approve")}
                  </button>
                  <button
                    className="admin-secondary-button admin-reject"
                    disabled={busy}
                    onClick={() => onDecision("reject")}
                  >
                    {t("account.reject")}
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className={`admin-status status-${a.status}`}>
              {t(`account.${a.status}`)}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
