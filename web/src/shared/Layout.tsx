import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mark } from "./Icons";

function Illustration() {
  return (
    <div className="illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="floating-note note-top">
        <span className="note-dot" /> لكل تعبير مساحة
      </div>
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
        <span>صباح الخير</span>
      </div>
      <div className="picture-card picture-heart">
        <svg viewBox="0 0 100 90">
          <path
            d="M50 69 21 41C3 20 33 3 50 23 67 3 97 20 79 41Z"
            fill="currentColor"
          />
        </svg>
        <span>أحبّك</span>
      </div>
      <div className="message-card">
        <span>أنا أريد</span>
        <span className="message-symbol">☀</span>
        <span>أن أعبّر</span>
        <span className="message-arrow">←</span>
      </div>
      <div className="floating-note note-bottom">
        <span className="check-circle">✓</span> التواصل يبدأ بخطوة
      </div>
      <span className="spark spark-one">✦</span>
      <span className="spark spark-two">✦</span>
    </div>
  );
}
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="site-header">
        <Link to="/login" className="brand" aria-label="ناطق، صفحة الدخول">
          <Mark />
          <span>
            <strong>
              ناطق<span className="brand-dot">.</span>
            </strong>
            <span className="brand-caption">مساحة للتواصل</span>
          </span>
        </Link>
        <span className="header-label">
          <span /> خطوة أقرب إلى التعبير
        </span>
      </header>
      <div className="auth-layout">
        <aside className="story-panel">
          <div className="eyebrow">
            <span /> لأن لكل تعبير قيمة
          </div>
          <h1>
            نتواصل بطرق مختلفة.
            <br />
            <span>ونلتقي في الفهم.</span>
          </h1>
          <p className="story-copy">
            مساحة تدعم التواصل والتعلّم، وتمنح أولياء الأمور بداية واضحة لمرافقة
            أطفالهم.
          </p>
          <Illustration />
          <div className="story-bottom">
            <span className="story-line" />
            <p>
              خطوة صغيرة اليوم،
              <br />
              <strong>ومساحة أوسع للتواصل.</strong>
            </p>
          </div>
        </aside>
        <main id="main" className="form-panel" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="site-footer">
        <span>ناطق — نفتح مساحة لكل تعبير</span>
        <span>
          واجهة أولياء الأمور <span className="footer-dot">·</span> NatiqAAC
        </span>
      </footer>
    </div>
  );
}
