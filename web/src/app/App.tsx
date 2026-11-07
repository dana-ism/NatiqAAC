import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthPage } from "../features/auth/AuthPage";
import { HomePage } from "../features/auth/HomePage";
import { useSession } from "../features/auth/session-context";
import { Layout } from "../shared/Layout";
import { ErrorAlert, Loading } from "../shared/Feedback";

function ProtectedHome() {
  const session = useSession();
  const location = useLocation();
  if (session.status === "anonymous")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.status === "checking") return <Loading />;
  if (session.status === "unavailable")
    return (
      <section className="auth-card">
        <span className="section-tag">لنحاول مجددًا</span>
        <h2>تعذّر التحقق من الجلسة.</h2>
        <ErrorAlert error={session.failure} />
        <button className="primary-button" onClick={() => void session.retry()}>
          إعادة المحاولة
        </button>
        <button className="text-button" onClick={session.signOut}>
          العودة إلى تسجيل الدخول
        </button>
      </section>
    );
  return <HomePage />;
}

export function App() {
  const location = useLocation();
  useEffect(() => {
    document.title = `${location.pathname === "/register" ? "إنشاء حساب" : location.pathname === "/home" ? "حسابك" : "تسجيل الدخول"} | ناطق`;
    document.getElementById("main")?.focus();
  }, [location.pathname]);
  return (
    <Layout>
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
