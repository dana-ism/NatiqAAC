import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthPage } from "../features/auth/AuthPage";
import { FeaturePreview, HomePage } from "../features/auth/HomePage";
import { useSession } from "../features/auth/session-context";
import { Layout } from "../shared/Layout";
import { ErrorAlert, Loading } from "../shared/Feedback";
import { I18nProvider } from "../i18n/I18nProvider";
import { useI18n } from "../i18n/context";
import { AdminPage } from "../features/admin/AdminPage";
import { AdminLayout } from "../features/admin/AdminLayout";
import { AdminApplicationsPage } from "../features/admin/AdminApplicationsPage";
import {
  AccountTypePage,
  ParentRegistrationPage,
  SpecialistRegistrationPage,
  VerificationPendingPage,
  VerificationResultPage,
  ApplicationStatusPage,
} from "../features/account/AccountPages";
import { SocialButtons } from "../features/account/SocialButtons";

function ProtectedHome({ admin = false }: { admin?: boolean }) {
  const { t } = useI18n();
  const session = useSession();
  const location = useLocation();
  if (session.status === "anonymous")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.status === "onboarding")
    return <Navigate to="/application-status" replace />;
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
  if (admin && session.identity?.role !== "ADMIN")
    return <Navigate to="/home" replace />;
  if (admin || session.identity?.role === "ADMIN")
    return admin ? <AdminPage /> : <Navigate to="/admin" replace />;
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
    const page = location.pathname;
    const title =
      page === "/admin/specialist-applications"
        ? "account.applications"
        : page === "/admin"
          ? "admin.title"
          : page.startsWith("/register")
            ? "auth.register"
            : page === "/home"
              ? "title.home"
              : page === "/account/connections"
                ? "account.connections"
                : page === "/application-status"
                  ? "account.status"
                  : page === "/verify-email" || page === "/verification-pending"
                    ? "account.pending"
                    : "auth.login";
    document.title = `${t(title)} | ${t("brand.name")}`;
  }, [location.pathname, t]);
  useEffect(() => {
    document.getElementById("main")?.focus();
  }, [location.pathname]);
  if (
    location.pathname.startsWith("/admin") &&
    session.status === "authenticated" &&
    session.identity?.role === "ADMIN"
  ) {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/admin/specialist-applications"
            element={<AdminApplicationsPage />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    );
  }
  return (
    <Layout
      welcome={welcome}
      afterContent={welcome ? <FeaturePreview /> : undefined}
    >
      <Routes>
        <Route path="/login" element={<AuthPage key="login" />} />
        <Route path="/register" element={<AccountTypePage />} />
        <Route path="/register/parent" element={<ParentRegistrationPage />} />
        <Route
          path="/register/specialist"
          element={<SpecialistRegistrationPage />}
        />
        <Route
          path="/verification-pending"
          element={<VerificationPendingPage />}
        />
        <Route path="/verify-email" element={<VerificationResultPage />} />
        <Route
          path="/application-status"
          element={
            session.status === "anonymous" ? (
              <Navigate to="/login" replace />
            ) : session.status === "checking" ||
              session.status === "unavailable" ? (
              <ProtectedHome />
            ) : (
              <ApplicationStatusPage />
            )
          }
        />
        <Route
          path="/account/connections"
          element={
            session.status === "authenticated" ||
            session.status === "onboarding" ? (
              <section className="auth-card">
                <h2>{t("account.connections")}</h2>
                <p>{t("account.connectionsHelp")}</p>
                <SocialButtons intent="link" />
              </section>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/admin/specialist-applications"
          element={<ProtectedHome admin />}
        />
        <Route path="/home" element={<ProtectedHome />} />
        <Route path="/admin" element={<ProtectedHome admin />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Layout>
  );
}
