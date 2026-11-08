import { ar, type MessageKey } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export type Translate = (
  key: MessageKey,
  params?: { seconds: number },
) => string;
export const localeStorageKey = "natiqaac.locale";
const resources: Record<Locale, Partial<Record<MessageKey, string>>> = {
  ar,
  en,
};

export function translator(locale: Locale): Translate {
  return (key, params) => {
    // Arabic is the source fallback; user input never becomes a translation key.
    if (!Object.hasOwn(ar, key)) return ar["error.unexpected"];
    const message = resources[locale][key] || ar[key] || ar["error.unexpected"];
    return message.replace("{seconds}", params ? String(params.seconds) : "");
  };
}
