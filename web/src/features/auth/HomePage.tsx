import { useSession } from "./session-context";
import { useI18n } from "../../i18n/context";
import { Link } from "react-router-dom";

export function HomePage() {
  const { t } = useI18n();
  const { identity, signOut } = useSession();
  if (!identity) return null;
  function discover() {
    const section = document.getElementById("coming-soon");
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section?.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "start",
    });
    document
      .getElementById("coming-soon-title")
      ?.focus({ preventScroll: true });
  }
  return (
    <section className="auth-card home-card" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{t("home.title")}</h2>
      <div className="identity-card">
        <span className="identity-icon" aria-hidden="true">
          {t("brand.name").slice(0, 1)}
        </span>
        <div>
          <span className="section-tag">{t("home.account")}</span>
          <p dir="ltr" className="identity-email">
            {identity.email}
          </p>
          <span className="role-badge">{t(`role.${identity.role}`)}</span>
        </div>
      </div>
      <p className="verified-badge" role="status">
        <span aria-hidden="true">✓</span> {t("home.signedIn")}
      </p>
      <button
        type="button"
        className="primary-button discover-button"
        onClick={discover}
      >
        {t("home.discover")}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M12 4v16m-6-6 6 6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="logout-button"
        onClick={signOut}
        aria-describedby="logout-hint"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            d="M10 4H5v16h5m4-13 5 5-5 5m-6-5h11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("home.signOut")}
      </button>
      <p className="local-signout-note" id="logout-hint">
        {t("home.localSignOut")}
      </p>
      <Link to="/account/connections">{t("account.connections")}</Link>
    </section>
  );
}

export function FeaturePreview() {
  const { t } = useI18n();
  return (
    <section
      id="coming-soon"
      className="coming-soon"
      aria-labelledby="coming-soon-title"
    >
      <div className="coming-soon-symbol" aria-hidden="true">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M8 10h32v22H24L14 40v-8H8V10Z" strokeLinejoin="round" />
          <path d="M16 20h16m-16 6h10" strokeLinecap="round" />
        </svg>
      </div>
      <div className="coming-soon-copy">
        <span className="coming-soon-badge">{t("home.soon")}</span>
        <h2 id="coming-soon-title" tabIndex={-1}>
          {t("home.futureTitle")}
        </h2>
        <p>{t("home.futureDescription")}</p>
      </div>
    </section>
  );
}
