import { createContext, useContext } from "react";
import type { Locale, Translate } from "./messages";

export const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
} | null>(null);

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is required");
  return value;
}
