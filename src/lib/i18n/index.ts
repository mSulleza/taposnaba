import { dictionary, type Locale, type MessageKey } from "./dictionary";

export type { Locale, MessageKey };
export const LOCALES: Locale[] = ["tl", "en"];

export function isLocale(x: unknown): x is Locale {
  return x === "tl" || x === "en";
}

/** Build a translator for a locale. `{name}` placeholders are interpolated. */
export function getT(locale: Locale) {
  const table = dictionary[locale] ?? dictionary.tl;
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let s: string = table[key] ?? dictionary.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };
}

export type Translator = ReturnType<typeof getT>;

/** Pick the localized field from a bilingual row (falls back to the other language). */
export function pickLang<T extends Record<string, unknown>>(
  row: T,
  base: string,
  locale: Locale
): string {
  const primary = row[`${base}_${locale}`];
  const other = row[`${base}_${locale === "tl" ? "en" : "tl"}`];
  return (typeof primary === "string" && primary.trim() ? primary : (other as string)) ?? "";
}
