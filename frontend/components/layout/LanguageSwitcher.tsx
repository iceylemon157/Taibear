"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n/useI18n";
import { LOCALE_OPTIONS } from "@/lib/i18n/types";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={`inline-flex items-center rounded-[12px] bg-white/95 ${compact ? "px-2 h-[34px]" : "px-3 h-[38px]"}`} style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.08)" }}>
      <Languages size={compact ? 15 : 16} color="#666" />
      <span className={`ml-1 mr-2 ${compact ? "text-[11px]" : "text-[12px]"}`} style={{ color: "#666" }}>
        {t("nav.language")}
      </span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className={`outline-none border-none bg-transparent ${compact ? "text-[11px]" : "text-[12px]"}`}
        style={{ color: "#141414" }}
      >
        {LOCALE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
