"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { en } from "@/lib/i18n/dictionaries/en";
import { ja } from "@/lib/i18n/dictionaries/ja";
import { zhTW } from "@/lib/i18n/dictionaries/zh-TW";
import type { I18nContextValue, Locale } from "@/lib/i18n/types";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/types";

const dictionaries: Record<Locale, Record<string, string>> = {
  "zh-TW": zhTW,
  en,
  ja,
};

function detectLocale(): Locale {
  if (typeof window === "undefined") {
    return "zh-TW";
  }

  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved === "zh-TW" || saved === "en" || saved === "ja") {
    return saved;
  }

  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("ja")) {
    return "ja";
  }
  if (lang.startsWith("en")) {
    return "en";
  }
  return "zh-TW";
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-TW");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];
    return {
      locale,
      setLocale: setLocaleState,
      t: (key: string, params?: Record<string, string | number>) => {
        const template = dict[key] ?? dictionaries["zh-TW"][key] ?? key;
        if (!params) {
          return template;
        }
        return Object.entries(params).reduce(
          (acc, [paramKey, value]) => acc.replaceAll(`{{${paramKey}}}`, String(value)),
          template
        );
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18nContext(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18nContext must be used inside I18nProvider");
  }
  return ctx;
}
