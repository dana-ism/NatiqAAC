import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/context";
import { ApiError } from "../../shared/api";
import { ErrorAlert } from "../../shared/Feedback";
import { useSession } from "../auth/session-context";
import { AccountAvatar } from "./AdminAccountMenu";
import { AdminPhotoEditor } from "./AdminPhotoEditor";
import { useAdminProfile } from "./profile-context";
import {
  adminProfileResult,
  accountDisplayName,
  validDisplayName,
} from "./profile.api";

export function AccountInformation() {
  const { profile } = useAdminProfile();
  const { t, locale } = useI18n();
  return (
    <dl className="admin-account-details">
      <div>
        <dt>{t("auth.email")}</dt>
        <dd>
          <bdi>{profile.email}</bdi>
        </dd>
      </div>
      <div>
        <dt>{t("profile.role")}</dt>
        <dd>{t("role.ADMIN")}</dd>
      </div>
      <div>
        <dt>{t("profile.status")}</dt>
        <dd>
          <span className="admin-account-active">{t("profile.active")}</span>
        </dd>
      </div>
      <div>
        <dt>{t("profile.emailStatus")}</dt>
        <dd>
          {t(profile.emailVerified ? "profile.verified" : "profile.unverified")}
        </dd>
      </div>
      <div>
        <dt>{t("profile.created")}</dt>
        <dd>
          <time dateTime={profile.createdAt}>
            {new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
              dateStyle: "medium",
            }).format(new Date(profile.createdAt))}
          </time>
        </dd>
      </div>
    </dl>
  );
}
export function AdminProfilePage() {
  const { profile, updateProfile, reload } = useAdminProfile();
  const session = useSession();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.fullName);
  const [version, setVersion] = useState(profile.updatedAt);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const conflict = failure instanceof ApiError && failure.status === 409;
  function begin() {
    setName(profile.fullName);
    setVersion(profile.updatedAt);
    setEditing(true);
    setSaved(false);
    setFailure(null);
    setInvalid(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const value = name.trim();
    if (!validDisplayName(value)) {
      setInvalid(true);
      input.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const next = await session.authenticatedPost(
        "/admin/profile/name",
        { fullName: value, expectedUpdatedAt: version },
        adminProfileResult,
      );
      updateProfile(next);
      if (!alive.current) return;
      setEditing(false);
      setSaved(true);
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (error) {
      if (alive.current) setFailure(error);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <header className="admin-page-heading">
        <p className="admin-eyebrow">{t("admin.portal")}</p>
        <h1>{t("profile.myProfile")}</h1>
        <p>{t("profile.intro")}</p>
      </header>
      <div className="admin-account-layout">
        <section
          className="admin-panel admin-profile-summary"
          aria-labelledby="profile-name"
        >
          <AccountAvatar name={profile.fullName} large />
          <h2 id="profile-name">
            <bdi>
              {accountDisplayName(profile.fullName, t("profile.fallback"))}
            </bdi>
          </h2>
          <span className="admin-account-role">{t("role.ADMIN")}</span>
          <AdminPhotoEditor />
          <p>{t("profile.personalOnly")}</p>
          <Link className="admin-button secondary" to="/admin/account-settings">
            {t("profile.settings")}
          </Link>
        </section>
        <section
          className="admin-panel admin-account-panel"
          aria-labelledby="profile-info"
        >
          <div className="admin-account-section-heading">
            <h2 id="profile-info">{t("profile.info")}</h2>
            {!editing && (
              <button
                ref={editButton}
                type="button"
                className="admin-button secondary"
                onClick={begin}
              >
                {t("profile.edit")}
              </button>
            )}
          </div>
          {saved && (
            <p className="alert success-alert" role="status">
              {t("profile.saved")}
            </p>
          )}
          {conflict ? (
            <div className="alert error-alert" role="alert">
              <p>{t("profile.conflict")}</p>
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => {
                  setEditing(false);
                  setFailure(null);
                  reload();
                }}
              >
                {t("profile.reload")}
              </button>
            </div>
          ) : (
            <ErrorAlert error={failure} />
          )}
          {editing ? (
            <form
              onSubmit={(event) => void submit(event)}
              noValidate
              aria-busy={busy}
            >
              <label htmlFor="admin-display-name">{t("profile.name")}</label>
              <input
                ref={input}
                id="admin-display-name"
                value={name}
                maxLength={100}
                autoComplete="name"
                dir="auto"
                disabled={busy}
                aria-invalid={invalid}
                aria-describedby={
                  invalid ? "admin-name-error" : "admin-name-help"
                }
                onChange={(event) => {
                  setName(event.target.value);
                  setInvalid(false);
                }}
              />
              <p className="field-hint" id="admin-name-help">
                {t("profile.nameHelp")}
              </p>
              {invalid && (
                <p className="field-error" id="admin-name-error" role="alert">
                  {t("profile.invalidName")}
                </p>
              )}
              <div className="admin-account-form-actions">
                <button className="admin-button" disabled={busy || conflict}>
                  {t(busy ? "profile.saving" : "profile.save")}
                </button>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setFailure(null);
                    setInvalid(false);
                    requestAnimationFrame(() => editButton.current?.focus());
                  }}
                >
                  {t("account.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div className="admin-profile-saved-name">
              <span>{t("profile.name")}</span>
              <strong>
                <bdi>{profile.fullName || t("profile.fallback")}</bdi>
              </strong>
            </div>
          )}
          <AccountInformation />
          <p className="admin-account-note">{t("profile.emailReadonly")}</p>
        </section>
      </div>
    </>
  );
}
