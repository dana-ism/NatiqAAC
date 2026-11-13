import { Link } from "react-router-dom";
import { ApiError } from "../../shared/api";
import { ErrorAlert } from "../../shared/Feedback";
import { useAccountCopy } from "./account.messages";

export type SocialFailure = {
  error: unknown;
  phase: "start" | "context" | "finish";
};

export function SocialError({
  failure,
  signIn,
}: {
  failure: SocialFailure | null;
  signIn: () => void;
}) {
  const c = useAccountCopy();
  if (!failure) return null;
  const error = failure.error;
  const code = error instanceof ApiError ? error.code : undefined;
  const key =
    code === "OAUTH_EMAIL_CONFLICT"
      ? "account.googleEmailConflict"
      : code === "OAUTH_IDENTITY_CONFLICT"
        ? "account.identityConflict"
        : code === "OAUTH_PROVIDER_ALREADY_LINKED"
          ? "account.providerAlreadyLinked"
          : code === "OAUTH_REGISTRATION_REQUIRED"
            ? "account.registrationRequired"
            : error instanceof ApiError &&
                error.status === 401 &&
                failure.phase !== "start"
              ? "account.transactionExpired"
              : error instanceof ApiError &&
                  error.status === 404 &&
                  failure.phase === "context"
                ? "account.signInUnavailable"
                : null;
  return (
    <>
      {key ? (
        <div className="alert error-alert" role="alert">
          <p>{c(key)}</p>
        </div>
      ) : (
        <ErrorAlert error={error} />
      )}
      {code === "OAUTH_EMAIL_CONFLICT" && (
        <button type="button" className="primary-button" onClick={signIn}>
          {c("account.signInToLink")}
        </button>
      )}
      {code === "OAUTH_REGISTRATION_REQUIRED" && (
        <p className="switch-copy">
          <Link to="/register">{c("account.choose")}</Link>
        </p>
      )}
    </>
  );
}
