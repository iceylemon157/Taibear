"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/services/store/appStore";

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const PANEL_BG =
  "linear-gradient(180deg, rgba(255,210,106,0.9) 0%, rgba(156,200,181,0.85) 50%, rgba(58,189,255,0.9) 100%)";

const GENDERS = [
  { id: "female", emoji: "🙋‍♀️", label: "女生" },
  { id: "male",   emoji: "🙋‍♂️", label: "男生" },
  { id: "other",  emoji: "🌈",   label: "不透露" },
];

const AGE_RANGES = ["18–25", "26–35", "36–45", "46–55", "55+"];

const COUNTRIES = [
  { flag: "🇹🇼", name: "台灣" },
  { flag: "🇯🇵", name: "日本" },
  { flag: "🇺🇸", name: "美國" },
  { flag: "🇰🇷", name: "韓國" },
  { flag: "🇨🇳", name: "中國" },
  { flag: "🇸🇬", name: "新加坡" },
];

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-[6px]">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step - 1 ? 48 : 12,
          height: 6,
          borderRadius: 3,
          background: i < step - 1 ? "#3abdff" : i === step - 1 ? "#3abdff" : "#f0f0f0",
          opacity: i < step - 1 ? 0.45 : 1,
          transition: "width 0.3s ease",
        }} />
      ))}
    </div>
  );
}

export default function OnboardingProfilePage() {
  const router = useRouter();
  const setUserProfile = useAppStore((s) => s.setUserProfile);

  const [gender, setGender] = useState("female");
  const [ageRange, setAgeRange] = useState("18–25");
  const [country, setCountry] = useState("🇹🇼 台灣");
  const [visible, setVisible] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  const handleContinue = () => {
    setUserProfile({ gender, ageRange, country });
    router.push("/onboarding/quiz");
  };

  const ContinueBtn = () => (
    <button
      onClick={handleContinue}
      className="w-full h-[56px] rounded-[28px] text-white text-[16px] font-semibold"
      style={{
        background: "linear-gradient(90deg, #3abdff 0%, #9cd8ed 50%, #fef3da 100%)",
        boxShadow: "0px 4px 16px rgba(0,0,0,0.18)",
        border: "none",
        cursor: "pointer",
        maxWidth: 480,
        display: "block",
        margin: "0 auto",
      }}
    >
      繼續 →
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex min-h-screen md:h-screen" style={{ background: CONIC_BG }}>

        {/* ── Left panel (desktop only) ── */}
        <aside
          className="hidden md:flex flex-col relative overflow-hidden flex-shrink-0"
          style={{ width: 440, background: PANEL_BG, backgroundColor: "#f6dea0" }}
        >
          {/* Decorative circles */}
          <div style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.22)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 100, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.16)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 120, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />

          {/* Logo */}
          <div className="absolute flex items-center gap-2" style={{ top: 38, left: 31 }}>
            <div className="rounded-[12px] overflow-hidden flex-shrink-0" style={{ width: 48, height: 48, background: "#3a6329" }}>
              <Image src="/taibear-icon-trimmed.png" alt="Taibear" width={64} height={64} className="object-cover" />
            </div>
            <span className="text-[22px] font-bold" style={{ color: "#3abdff" }}>Taibear</span>
          </div>

          {/* Taipei illustration */}
          <div className="absolute" style={{ top: 180, left: -8, width: "105%", height: 460 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.figma.com/api/mcp/asset/2bccc14b-85b8-4242-b7de-6677e9eb2b41"
              alt="Taipei"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          {/* Bottom text */}
          <div className="absolute" style={{ bottom: 96, left: 40 }}>
            <p className="font-bold text-white" style={{ fontSize: 32, lineHeight: 1.2 }}>歡迎加入 Taibear！</p>
            <p className="font-semibold" style={{ fontSize: 18, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>讓我們先認識你</p>
          </div>
          <p className="absolute text-[13px]" style={{ bottom: 24, left: 40, color: "rgba(255,255,255,0.45)" }}>© 2026 Taibear</p>
        </aside>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col md:overflow-y-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 md:px-10 pt-10 md:pt-10 pb-4">
            <StepDots step={1} total={3} />
            <button
              onClick={() => router.push("/trips")}
              style={{ fontSize: 13, color: "#8c8c8c", background: "none", border: "none", cursor: "pointer" }}
            >
              略過
            </button>
          </div>

          {/* Content */}
          <div
            className="flex-1 px-5 md:px-10 pb-28 md:pb-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(10px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            <h1 className="font-bold text-[#141414] mb-2" style={{ fontSize: 28 }}>嗨！先讓我們認識你 👋</h1>
            <p className="text-[15px] mb-7" style={{ color: "#8c8c8c" }}>這樣我們才能為你規劃最完美的旅程</p>

            {/* Gender */}
            <p className="text-[13px] font-semibold mb-3" style={{ color: "#4d4d4d" }}>你是？</p>
            <div className="flex gap-3 mb-6">
              {GENDERS.map((g, i) => {
                const selected = gender === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGender(g.id)}
                    style={{
                      flex: 1,
                      height: 88,
                      background: selected ? "#e0f4ff" : "white",
                      border: `2px solid ${selected ? "#3abdff" : "transparent"}`,
                      borderRadius: 16,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      cursor: "pointer",
                      boxShadow: selected ? "0px 2px 8px rgba(58,189,255,0.22)" : "0px 2px 8px rgba(0,0,0,0.06)",
                      transition: "all 0.18s ease",
                      animation: `fadeUp 0.35s ease ${i * 0.06 + 0.15}s both`,
                    }}
                  >
                    <span style={{ fontSize: 30 }}>{g.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? "#3abdff" : "#141414", transition: "color 0.15s" }}>{g.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Age range */}
            <p className="text-[13px] font-semibold mb-3" style={{ color: "#4d4d4d" }}>年齡範圍</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {AGE_RANGES.map((age, i) => {
                const selected = ageRange === age;
                return (
                  <button
                    key={age}
                    onClick={() => setAgeRange(age)}
                    style={{
                      height: 40,
                      padding: "0 20px",
                      borderRadius: 20,
                      background: selected ? "#3abdff" : "white",
                      border: selected ? "none" : "1.5px solid #f0f0f0",
                      color: selected ? "white" : "#8c8c8c",
                      fontSize: 13,
                      fontWeight: selected ? 600 : 400,
                      cursor: "pointer",
                      boxShadow: "0px 2px 6px rgba(0,0,0,0.04)",
                      transition: "all 0.18s ease",
                      animation: `fadeUp 0.35s ease ${i * 0.05 + 0.25}s both`,
                    }}
                  >
                    {age}
                  </button>
                );
              })}
            </div>

            {/* Country */}
            <p className="text-[13px] font-semibold mb-3" style={{ color: "#4d4d4d" }}>你從哪裡來？</p>
            <div
              className="flex items-center mb-3 rounded-[14px] px-4"
              style={{ height: 52, background: "white", border: "1.5px solid #f0f0f0", boxShadow: "0px 2px 6px rgba(0,0,0,0.04)", cursor: "pointer" }}
            >
              <span className="flex-1 text-[14px] text-[#141414]">{country}</span>
              <span style={{ color: "#8c8c8c", fontSize: 13 }}>▾</span>
            </div>
            <div className="flex flex-wrap items-center gap-2" style={{ animation: `fadeUp 0.35s ease 0.4s both`, opacity: 0 }}>
              <span className="text-[11px]" style={{ color: "#8c8c8c" }}>熱門：</span>
              {COUNTRIES.map((c) => {
                const label = `${c.flag} ${c.name}`;
                const selected = country === label;
                return (
                  <button
                    key={c.name}
                    onClick={() => setCountry(label)}
                    style={{
                      height: 30,
                      padding: "0 10px",
                      borderRadius: 15,
                      background: selected ? "#e0f4ff" : "white",
                      border: `1px solid ${selected ? "#3abdff" : "#f0f0f0"}`,
                      color: selected ? "#3abdff" : "#8c8c8c",
                      fontSize: 11,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop continue button */}
          <div className="hidden md:block px-10 pb-10 pt-2">
            <ContinueBtn />
          </div>
        </div>
      </div>

      {/* Mobile fixed continue button */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 px-5 pb-8 pt-3"
        style={{ background: "linear-gradient(to top, rgba(255,255,255,0.96) 65%, transparent)" }}
      >
        <ContinueBtn />
      </div>
    </>
  );
}
