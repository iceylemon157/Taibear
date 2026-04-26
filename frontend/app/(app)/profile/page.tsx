"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/services/store/appStore";
import { useI18n } from "@/lib/i18n/useI18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

const CONIC = "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const MENU_ITEMS = [
  { emoji: "🧳", labelKey: "profile.menu.myTrips", descKey: "profile.menu.myTripsDesc" },
  { emoji: "🏨", labelKey: "profile.menu.savedHotels", descKey: "profile.menu.savedHotelsDesc" },
  { emoji: "❤️", labelKey: "profile.menu.favoriteSpots", descKey: "profile.menu.favoriteSpotsDesc" },
  { emoji: "🔔", labelKey: "profile.menu.notifications", descKey: "profile.menu.notificationsDesc" },
  { emoji: "🌐", labelKey: "profile.menu.language", descKey: "profile.menu.languageDesc", language: true },
  { emoji: "🛡️", labelKey: "profile.menu.privacy", descKey: "profile.menu.privacyDesc" },
];

export default function ProfilePage() {
  const { t } = useI18n();
  const router = useRouter();
  const userPreferences = useAppStore((s) => s.userPreferences);

  return (
    <div className="min-h-screen" style={{ background: CONIC }}>
      {/* Avatar + name section */}
      <div className="flex flex-col items-center pt-10 pb-6 px-4">
        <div
          className="w-[80px] h-[80px] rounded-full flex items-center justify-center text-[36px] mb-4"
          style={{ background: "white", boxShadow: "0px 4px 16px rgba(0,0,0,0.08)" }}
        >
          🐻
        </div>
        <p className="text-[22px] font-bold text-[#141414]">{t("profile.title")}</p>
        <p className="text-[14px] mt-1" style={{ color: "#999" }}>emilly@gmail.com</p>

        <div className="flex gap-6 mt-5">
            {[
              { value: "3", label: t("profile.stats.trips") },
              { value: "12", label: t("profile.stats.spots") },
              { value: "5", label: t("profile.stats.hotels") },
            ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-[20px] font-bold text-[#141414]">{s.value}</p>
              <p className="text-[12px]" style={{ color: "#999" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preferences section */}
      {userPreferences && userPreferences.selectedTags.length > 0 && (
        <div className="mx-4 md:mx-auto md:max-w-[600px] mb-4">
          <div
            className="bg-white rounded-[20px] px-5 py-4"
            style={{ boxShadow: "0px 4px 16px rgba(0,0,0,0.06)" }}
          >
            <p className="text-[14px] font-semibold text-[#141414] mb-3">{t("profile.preferences")}</p>
            <div className="flex flex-wrap gap-2">
              {userPreferences.selectedTags.map((tag, i) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-[20px] text-[13px] font-medium"
                  style={{
                    background: i % 2 === 0 ? "rgba(58,189,255,0.12)" : "rgba(255,210,106,0.2)",
                    color: i % 2 === 0 ? "#3abdff" : "#9a6e00",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={() => router.push("/onboarding/quiz")}
              className="mt-3 text-[12px]"
              style={{ color: "#999", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {t("profile.resetPreferences")}
            </button>
          </div>
        </div>
      )}

      {/* Menu list */}
      <div className="mx-4 md:mx-auto md:max-w-[600px] bg-white rounded-[20px] overflow-hidden mb-6"
        style={{ boxShadow: "0px 4px 16px rgba(0,0,0,0.06)" }}>
        {MENU_ITEMS.map((item, i) => (
          <div key={item.labelKey} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
            <span className="text-[22px] w-8 text-center flex-shrink-0">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#141414]">{t(item.labelKey)}</p>
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "#999" }}>{t(item.descKey)}</p>
            </div>
            {item.language ? <LanguageSwitcher compact /> : <span className="text-[#ccc] text-[18px] flex-shrink-0">›</span>}
          </div>
        ))}
      </div>

      {/* Sign out */}
      <div className="mx-4 md:mx-auto md:max-w-[600px] mb-6">
        <Link href="/login"
          className="w-full flex items-center justify-center h-[52px] rounded-[16px] text-[15px] font-semibold border-[1.5px]"
          style={{ borderColor: "#e0e0e0", color: "#999", background: "white" }}>
          {t("common.logout")}
        </Link>
      </div>

      <p className="text-center text-[13px] pb-6" style={{ color: "#ccc" }}>{t("profile.footer")}</p>
    </div>
  );
}
