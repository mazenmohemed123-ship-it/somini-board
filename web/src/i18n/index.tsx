"use client";

/**
 * Minimal i18n layer. Dictionaries are plain JSON keyed by dotted ids.
 * Arabic is the default and the only RTL locale here. The provider stores the
 * active locale in localStorage and exposes a t(key) helper.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import ar from "./ar.json";
import en from "./en.json";
import fr from "./fr.json";
import de from "./de.json";
import it from "./it.json";
import tr from "./tr.json";

export const LOCALES = ["ar", "en", "fr", "de", "it", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

const DICTS: Record<Locale, Record<string, string>> = { ar, en, fr, de, it, tr };
const RTL_LOCALES: Locale[] = ["ar"];

interface I18nContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("locale")) as Locale | null;
    if (stored && LOCALES.includes(stored)) setLocaleState(stored);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("locale", l);
  };

  const value = useMemo<I18nContextValue>(() => {
    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    const dict = DICTS[locale] ?? DICTS.ar;
    return { locale, dir, setLocale, t: (key) => dict[key] ?? key };
  }, [locale]);

  // Keep <html dir/lang> in sync.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = value.locale;
      document.documentElement.dir = value.dir;
    }
  }, [value.locale, value.dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
