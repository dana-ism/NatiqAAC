import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthPage } from "../features/auth/AuthPage";
import { FeaturePreview, HomePage } from "../features/auth/HomePage";
import { useSession } from "../features/auth/session-context";
import { Layout } from "../shared/Layout";
import { ErrorAlert, Loading } from "../shared/Feedback";
import { I18nProvider } from "../i18n/I18nProvider";
import { useI18n } from "../i18n/context";

function ProtectedHome() {
  const { t } = useI18n();
  const session = useSession();
  const location = useLocation();
  if (session.status === "anonymous")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.status === "checking") return <Loading />;
  if (session.status === "unavailable")
    return (
      <section className="auth-card">
        <span className="section-tag">{t("session.tryAgain")}</span>
        <h2>{t("session.unverified")}</h2>
        <ErrorAlert error={session.failure} />
        <button className="primary-button" onClick={() => void session.retry()}>
          {t("session.retry")}
        </button>
        <button className="text-button" onClick={session.signOut}>
          {t("session.back")}
        </button>
      </section>
    );
  return <HomePage />;
}

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const location = useLocation();
  const session = useSession();
  const welcome =
    location.pathname === "/home" && session.status === "authenticated";
  useEffect(() => {
    document.title = `${t(location.pathname === "/register" ? "auth.register" : location.pathname === "/home" ? "title.home" : "auth.login")} | ${t("brand.name")}`;
  }, [location.pathname, t]);
  useEffect(() => {
    document.getElementById("main")?.focus();
  }, [location.pathname]);
  return (
    <Layout
      welcome={welcome}
      afterContent={welcome ? <FeaturePreview /> : undefined}
    >
      <Routes>
        <Route path="/login" element={<AuthPage key="login" />} />
        <Route
          path="/register"
          element={<AuthPage key="register" register />}
        />
        <Route path="/home" element={<ProtectedHome />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Layout>
  );
}
