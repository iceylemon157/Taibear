export type Locale = "zh-TW" | "en" | "ja";

export type Dictionary = Record<string, string>;

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export const LOCALE_STORAGE_KEY = "taibear.locale";

export const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];
