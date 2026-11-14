import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useI18n } from "../../i18n/context";
import { ApiError } from "../../shared/api";
import { ErrorAlert } from "../../shared/Feedback";
import { useSession } from "../auth/session-context";
import { useAdminProfile } from "./profile-context";
import { adminProfileResult } from "./profile.api";
import { AdminIcon } from "./AdminIcons";

export function AdminPhotoEditor() {
  const {
    profile,
    updateProfile,
    reload,
    avatarLoading,
    avatarFailure,
    retryAvatar,
  } = useAdminProfile();
  const session = useSession();
  const { t } = useI18n();
  const [selection, setSelection] = useState<{
    file: File;
    url: string;
    version: string;
  } | null>(null);
  const [removeVersion, setRemoveVersion] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<"photo.saved" | "photo.removed" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const chosen = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (selection) URL.revokeObjectURL(selection.url);
    },
    [selection],
  );
  const conflict = failure instanceof ApiError && failure.status === 409;
  function cancel() {
    chosen.current++;
    setSelection(null);
    setRemoveVersion(null);
    setInvalid(false);
    setFailure(null);
    setNotice(null);
    if (input.current) input.current.value = "";
  }
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const run = ++chosen.current;
    setSelection(null);
    setRemoveVersion(null);
    setNotice(null);
    setFailure(null);
    setInvalid(false);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 2 * 1024 * 1024
    ) {
      setInvalid(true);
      return;
    }
    try {
      // Reject executable/vector input before making a local preview. The server
      // independently decodes and validates every accepted upload.
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (n, i) => bytes[i] === n,
      );
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!png && !jpeg && !webp) throw Error("Invalid preview");
      if (mounted.current && chosen.current === run)
        setSelection({
          file,
          url: URL.createObjectURL(file),
          version: profile.updatedAt,
        });
    } catch {
      if (mounted.current && chosen.current === run) setInvalid(true);
    }
  }
  async function save(remove: boolean) {
    if (lock.current || (remove ? !removeVersion : !selection)) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      let next;
      if (remove)
        next = await session.authenticatedPost(
          "/admin/profile/avatar/remove",
          { expectedUpdatedAt: removeVersion },
          adminProfileResult,
        );
      else {
        const form = new FormData();
        form.append("expectedUpdatedAt", selection!.version);
        form.append("avatar", selection!.file);
        next = await session.authenticatedUpload(
          "/admin/profile/avatar",
          form,
          adminProfileResult,
        );
      }
      updateProfile(next);
      if (!mounted.current) return;
      cancel();
      setNotice(remove ? "photo.removed" : "photo.saved");
    } catch (error) {
      if (mounted.current) {
        if (error instanceof ApiError && [400, 413, 415].includes(error.status))
          setInvalid(true);
        else setFailure(error);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="admin-photo-editor"
      aria-labelledby="photo-title"
      aria-busy={busy}
    >
      <h3 id="photo-title">{t("photo.title")}</h3>
      <p className="admin-account-note" id="photo-help">
        {t("photo.help")}
      </p>
      {avatarLoading && <p role="status">{t("photo.loading")}</p>}
      {!!avatarFailure && (
        <p className="alert info-alert" role="status">
          {t("photo.loadFailed")}{" "}
          <button
            type="button"
            className="admin-button secondary"
            onClick={retryAvatar}
          >
            {t("photo.retry")}
          </button>
        </p>
      )}
      {notice && (
        <p className="alert success-alert" role="status">
          {t(notice)}
        </p>
      )}
      {invalid && (
        <p id="photo-error" className="field-error" role="alert">
          {t("photo.invalid")}
        </p>
      )}
      {conflict ? (
        <div className="alert error-alert" role="alert">
          <p>{t("profile.conflict")}</p>
          <button
            type="button"
            className="admin-button secondary"
            onClick={() => {
              cancel();
              reload();
            }}
          >
            {t("profile.reload")}
          </button>
        </div>
      ) : (
        <ErrorAlert error={failure} />
      )}
      {selection && (
        <div className="admin-photo-preview">
          <img
            src={selection.url}
            alt={t("photo.preview")}
            onError={() => {
              setSelection(null);
              setInvalid(true);
            }}
          />
          <button
            type="button"
            className="admin-button"
            disabled={busy || conflict || invalid}
            onClick={() => void save(false)}
          >
            {t(busy ? "photo.saving" : "photo.confirm")}
          </button>
          <button
            type="button"
            className="admin-button secondary"
            disabled={busy}
            onClick={cancel}
          >
            {t("account.cancel")}
          </button>
        </div>
      )}
      {removeVersion && (
        <div className="admin-photo-removal">
          <p>{t("photo.removeHelp")}</p>
          <button
            type="button"
            className="admin-button"
            disabled={busy || conflict}
            onClick={() => void save(true)}
          >
            {t(busy ? "photo.saving" : "photo.confirmRemove")}
          </button>
          <button
            type="button"
            className="admin-button secondary"
            disabled={busy}
            onClick={cancel}
          >
            {t("account.cancel")}
          </button>
        </div>
      )}
      {!selection && !removeVersion && (
        <>
          <label className="sr-only" htmlFor="admin-avatar-file">
            {t(profile.hasAvatar ? "photo.replace" : "photo.choose")}
          </label>
          <input
            className="sr-only"
            tabIndex={-1}
            ref={input}
            id="admin-avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            aria-describedby={invalid ? "photo-error" : "photo-help"}
            onChange={(event) => void select(event)}
          />
          <button
            type="button"
            className="admin-button secondary admin-photo-picker"
            disabled={busy}
            aria-describedby="photo-help"
            onClick={() => input.current?.click()}
          >
            <AdminIcon name="camera" />
            {t(profile.hasAvatar ? "photo.replace" : "photo.choose")}
          </button>
          {profile.hasAvatar && (
            <button
              type="button"
              className="admin-button secondary"
              disabled={busy}
              onClick={() => {
                setNotice(null);
                setFailure(null);
                setInvalid(false);
                setRemoveVersion(profile.updatedAt);
              }}
            >
              {t("photo.remove")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
