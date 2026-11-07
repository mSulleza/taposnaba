"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getT, type Locale, type Translator } from "./index";

const LocaleContext = createContext<{ locale: Locale; t: Translator }>({
  locale: "tl",
  t: getT("tl"),
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: getT(locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT() {
  return useContext(LocaleContext);
}
