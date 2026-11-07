import { errorMessage } from "./api";
export function ErrorAlert({
  error,
  context = "session",
}: {
  error: unknown;
  context?: "login" | "register" | "session";
}) {
  if (!error) return null;
  return (
    <div className="alert error-alert" role="alert">
      <span aria-hidden="true">!</span>
      <p>{errorMessage(error, context)}</p>
    </div>
  );
}
export function Loading({
  label = "جارٍ التحقق من جلستك…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
