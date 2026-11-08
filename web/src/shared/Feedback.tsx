import { errorMessage } from "./api";
import { useI18n } from "../i18n/context";
export function ErrorAlert({
  error,
  context = "session",
}: {
  error: unknown;
  context?: "login" | "register" | "session";
}) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div className="alert error-alert" role="alert">
      <span aria-hidden="true">!</span>
      <p>{errorMessage(error, context, t)}</p>
    </div>
  );
}
export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label ?? t("session.checking")}</p>
    </div>
  );
}
