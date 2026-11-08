import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./context";
import { localeStorageKey, translator, type Locale } from "./messages";

function initialLocale(): Locale {
  try {
    return localStorage.getItem(localeStorageKey) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const t = useMemo(() => translator(locale), [locale]);
  function setLocale(next: Locale) {
    updateLocale(next);
    try {
      localStorage.setItem(localeStorageKey, next);
    } catch {
      // The current window remains usable when browser storage is blocked.
    }
  }
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("meta.description"));
  }, [locale, t]);
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
