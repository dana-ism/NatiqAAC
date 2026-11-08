import { useI18n } from "./context";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t("language.label")}
    >
      <button
        type="button"
        lang="ar"
        dir="rtl"
        aria-pressed={locale === "ar"}
        onClick={() => setLocale("ar")}
      >
        العربية
      </button>
      <button
        type="button"
        lang="en"
        dir="ltr"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        English
      </button>
    </div>
  );
}
