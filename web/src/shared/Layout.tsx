import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mark } from "./Icons";
import { useI18n } from "../i18n/context";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

function Illustration({ welcome = false }: { welcome?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      {!welcome && (
        <div className="floating-note note-top">
          <span className="note-dot" /> {t("art.space")}
        </div>
      )}
      <div className="picture-card picture-sun">
        <svg viewBox="0 0 100 90" fill="none">
          <circle cx="50" cy="40" r="19" fill="currentColor" />
          <path
            d="M50 9v-5m0 67v-5M19 40h-5m72 0h-5M28 18l-4-4m52 52-4-4m0-44 4-4M24 66l4-4"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <span>{t("art.morning")}</span>
      </div>
      <div className="picture-card picture-heart">
        <svg viewBox="0 0 100 90">
          <path
            d="M50 69 21 41C3 20 33 3 50 23 67 3 97 20 79 41Z"
            fill="currentColor"
          />
        </svg>
        <span>{t("art.love")}</span>
      </div>
      <div className="message-card">
        <span>{t("art.want")}</span>
        <span className="message-symbol">☀</span>
        <span>{t("art.express")}</span>
        <span className="message-arrow directional-arrow">←</span>
      </div>
      <div className="floating-note note-bottom">
        <span className="check-circle">✓</span> {t("art.step")}
      </div>
      {!welcome && (
        <>
          <span className="spark spark-one">✦</span>
          <span className="spark spark-two">✦</span>
        </>
      )}
    </div>
  );
}
export function Layout({
  children,
  welcome = false,
  afterContent,
  onboarding = false,
}: {
  children: ReactNode;
  welcome?: boolean;
  afterContent?: ReactNode;
  onboarding?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`site-shell${welcome ? " welcome-page" : ""}${onboarding ? " auth-onboarding" : ""}`}
    >
      <a className="skip-link" href="#main">
        {t("layout.skip")}
      </a>
      <header className="site-header">
        <Link
          to={welcome ? "/home" : "/login"}
          className="brand"
          aria-label={t(welcome ? "brand.welcome" : "brand.login")}
        >
          <Mark />
          <span>
            <strong>
              {t("brand.name")}
              <span className="brand-dot">.</span>
            </strong>
            <span className="brand-caption">{t("brand.caption")}</span>
          </span>
        </Link>
        <div className="header-actions">
          {!welcome && (
            <span className="header-label">
              <span /> {t("layout.header")}
            </span>
          )}
          <LanguageSwitcher />
        </div>
      </header>
      <div className="auth-layout">
        <aside className="story-panel">
          {!welcome && (
            <div className="eyebrow">
              <span /> {t("layout.eyebrow")}
            </div>
          )}
          <h1>
            {welcome ? (
              <>
                {t("layout.headline")} <span>{t("layout.headlineEnd")}</span>
              </>
            ) : (
              <>
                {t("layout.headline")}.
                <br />
                <span>{t("layout.headlineEnd")}.</span>
              </>
            )}
          </h1>
          <p className="story-copy">{t("layout.description")}</p>
          <Illustration welcome={welcome} />
          {!welcome && (
            <div className="story-bottom">
              <span className="story-line" />
              <p>
                {t("layout.smallStep")}
                <br />
                <strong>{t("layout.moreSpace")}</strong>
              </p>
            </div>
          )}
        </aside>
        <main id="main" className="form-panel" tabIndex={-1}>
          {children}
        </main>
      </div>
      {afterContent}
      <footer className="site-footer">
        {!welcome && <span>{t("layout.footer")}</span>}
        <span>
          {t("layout.parents")} <span className="footer-dot">·</span> NatiqAAC
        </span>
      </footer>
    </div>
  );
}
