import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { useI18n } from "../../i18n/context";
import { ErrorAlert, Loading } from "../../shared/Feedback";
import {
  applicationEnvelope,
  applicationList,
  applicationStates,
  messageResult,
  type ApplicationDetails,
  type ApplicationSummary,
} from "../account/account.api";
import { AdminIcon } from "./AdminIcons";
import { AdminApplicationDetails } from "./AdminApplicationDetails";
import { CommunicationMotif } from "./CommunicationMotif";

type Details = ApplicationDetails & ApplicationSummary;
export function AdminApplicationsPage() {
  const { t, locale } = useI18n();
  const session = useSession(),
    api = useRef(session);
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") ?? "ALL";
  const [search, setSearch] = useState("");
  const [applications, setApplications] = useState<ApplicationSummary[] | null>(
    null,
  );
  const [selected, setSelected] = useState<Details | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [notice, setNotice] = useState(false);
  const locked = useRef(false),
    mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null),
    confirmHeading = useRef<HTMLHeadingElement>(null);
  const returnId = useRef<string | null>(null);
  const detailController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      detailController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api.current
      .authenticatedGet(
        "/admin/specialist-applications",
        applicationList,
        controller.signal,
      )
      .then((v) => {
        if (!controller.signal.aborted) setApplications(v.applications);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setFailure(e);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (selected) heading.current?.focus();
    else if (returnId.current && applications) {
      const target =
        document.getElementById(returnId.current) ??
        document.getElementById("admin-applications-heading");
      target?.focus();
      returnId.current = null;
    }
  }, [selected, applications]);
  useEffect(() => {
    if (decision) confirmHeading.current?.focus();
  }, [decision]);
  const date = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
          dateStyle: "medium",
        }).format(new Date(value))
      : t("admin.notSubmitted");
  function refresh() {
    setApplications(null);
    setFailure(null);
    setAttempt((n) => n + 1);
  }
  async function details(id: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailure(null);
    setNotice(false);
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    try {
      const v = await api.current.authenticatedGet(
        `/admin/specialist-applications/${encodeURIComponent(id)}`,
        applicationEnvelope,
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      returnId.current = `review-${id}`;
      setSelected(v.application);
      setReason("");
      setDecision(null);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) setFailure(e);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function decide(e: React.FormEvent) {
    e.preventDefault();
    if (
      !selected ||
      !decision ||
      locked.current ||
      (decision === "reject" && reason.trim().length < 10)
    )
      return;
    locked.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await api.current.authenticatedPost(
        `/admin/specialist-applications/${encodeURIComponent(selected.id)}/${decision}`,
        decision === "reject" ? { reason: reason.trim() } : {},
        messageResult,
      );
      if (!mounted.current) return;
      // A confirmed mutation invalidates the displayed snapshot. Fetch the actual list.
      setApplications(null);
      setSelected(null);
      setDecision(null);
      setNotice(true);
      setAttempt((n) => n + 1);
    } catch (error) {
      if (mounted.current) setFailure(error);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function download() {
    if (!selected || locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const blob = await api.current.downloadDocument(
        `/admin/specialist-applications/${encodeURIComponent(selected.id)}/document`,
      );
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "qualification-document.pdf";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (mounted.current) setFailure(e);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const query = search.trim().toLocaleLowerCase(locale);
  const displayed = applications?.filter(
    (a) =>
      (filter === "ALL" ||
        !applicationStates.includes(
          filter as (typeof applicationStates)[number],
        ) ||
        a.status === filter) &&
      (!query ||
        [a.fullName, a.email, a.specialization].some((v) =>
          v.toLocaleLowerCase(locale).includes(query),
        )),
  );
  return (
    <>
      <div className="admin-page-heading admin-heading-row">
        <div>
          <p className="admin-eyebrow">{t("admin.workspace")}</p>
          <h1 id="admin-applications-heading" tabIndex={-1}>
            {t("account.applications")}
          </h1>
          <p>{t("admin.applicationsIntro")}</p>
        </div>
        {!selected && (
          <button
            className="admin-secondary-button"
            disabled={busy || applications === null}
            onClick={refresh}
          >
            {t("admin.refreshList")}
          </button>
        )}
      </div>
      {notice && (
        <p className="alert success-alert" role="status">
          {t("account.decided")}
        </p>
      )}
      {failure && (
        <div className="admin-panel admin-error">
          <ErrorAlert error={failure} />
          <button
            className="admin-text-button"
            disabled={busy}
            onClick={() => (selected ? void details(selected.id) : refresh())}
          >
            {t(selected ? "admin.refreshDetails" : "session.retry")}
          </button>
        </div>
      )}
      {busy && (
        <p className="admin-progress" role="status">
          {t("auth.wait")}
        </p>
      )}
      {selected ? (
        <>
          <button
            className="admin-back admin-text-button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setDecision(null);
              setFailure(null);
            }}
          >
            <AdminIcon name="arrow" />
            {t("account.back")}
          </button>
          <AdminApplicationDetails
            application={selected}
            busy={busy}
            decision={decision}
            reason={reason}
            heading={heading}
            confirmHeading={confirmHeading}
            date={date}
            onDownload={() => void download()}
            onDecision={setDecision}
            onReason={setReason}
            onSubmit={(e) => void decide(e)}
          />
        </>
      ) : (
        <>
          <div className="admin-list-tools">
            <div className="admin-filters">
              <div>
                <label htmlFor="application-search">{t("admin.search")}</label>
                <div className="admin-search">
                  <AdminIcon name="search" />
                  <input
                    id="application-search"
                    type="search"
                    maxLength={254}
                    value={search}
                    placeholder={t("admin.searchPlaceholder")}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="application-status">
                  {t("admin.filterStatus")}
                </label>
                <select
                  id="application-status"
                  value={
                    applicationStates.includes(
                      filter as (typeof applicationStates)[number],
                    )
                      ? filter
                      : "ALL"
                  }
                  onChange={(e) =>
                    setParams(
                      e.target.value === "ALL"
                        ? {}
                        : { status: e.target.value },
                      { replace: true },
                    )
                  }
                >
                  <option value="ALL">{t("admin.allStatuses")}</option>
                  {applicationStates.map((s) => (
                    <option key={s} value={s}>
                      {t(`account.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-results-bar">
              <p className="admin-list-limit">{t("admin.listLimit")}</p>
              {applications && (
                <p className="admin-result-count" role="status">
                  {t("signature.results")}:{" "}
                  <strong>
                    {new Intl.NumberFormat(locale).format(
                      displayed?.length ?? 0,
                    )}
                  </strong>{" "}
                  {t("signature.of")}{" "}
                  {new Intl.NumberFormat(locale).format(applications.length)}{" "}
                  {t("signature.loaded")}
                </p>
              )}
            </div>
          </div>
          {applications === null ? (
            !failure && (
              <div className="admin-loading">
                <Loading />
              </div>
            )
          ) : displayed?.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="sr-only">
                  {t("account.applications")}
                </caption>
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
                  {displayed.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.fullName}</strong>
                        <bdi className="admin-row-email">{a.email}</bdi>
                      </td>
                      <td data-label={t("account.specialization")}>
                        {a.specialization}
                      </td>
                      <td data-label={t("admin.submitted")}>
                        {date(a.submittedAt)}
                      </td>
                      <td>
                        <span className={`admin-status status-${a.status}`}>
                          {t(`account.${a.status}`)}
                        </span>
                      </td>
                      <td>
                        <button
                          id={`review-${a.id}`}
                          className="admin-row-action"
                          disabled={busy}
                          onClick={() => void details(a.id)}
                          aria-label={`${t("account.details")}: ${a.fullName}`}
                        >
                          {t("account.details")}
                          <AdminIcon
                            className="admin-directional"
                            name="arrow"
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="admin-empty admin-panel">
              <CommunicationMotif />
              <h2>
                {t(applications.length ? "admin.noResults" : "account.empty")}
              </h2>
              <p>
                {t(
                  applications.length
                    ? "admin.noResultsHelp"
                    : "admin.noApplicationsHelp",
                )}
              </p>
              {(search || filter !== "ALL") && (
                <button
                  className="admin-secondary-button"
                  onClick={() => {
                    setSearch("");
                    setParams({}, { replace: true });
                  }}
                >
                  {t("admin.clearFilters")}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
