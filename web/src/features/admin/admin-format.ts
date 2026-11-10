import type { Locale } from "../../i18n/messages";

/** Admin uses Latin digits consistently, while preserving localized words and date order. */
export const adminNumber = (locale: Locale, value: number) =>
  new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(value);
export const adminDate = (locale: Locale, value: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
    dateStyle: "medium",
    numberingSystem: "latn",
  }).format(new Date(value));
