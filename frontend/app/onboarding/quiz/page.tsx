"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postUserTags } from "@/services/api/users";
import { useAppStore } from "@/services/store/appStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const PANEL_BG =
  "linear-gradient(180deg, rgba(255,210,106,0.9) 0%, rgba(156,200,181,0.85) 50%, rgba(58,189,255,0.9) 100%)";

const TAIPEI_IMG =
  "https://www.figma.com/api/mcp/asset/2bccc14b-85b8-4242-b7de-6677e9eb2b41";

type TagDef = {
  id: string;
  label: string;
  emoji: string;
  color: string;
};

const TRAVEL_TAGS: TagDef[] = [
  { id: "food",      label: "美食探索", emoji: "🍜", color: "#FF8C42" },
  { id: "culture",   label: "文化歷史", emoji: "🏛️",  color: "#7f8c8d" },
  { id: "nature",    label: "自然健行", emoji: "🌿", color: "#38b26d" },
  { id: "photo",     label: "打卡拍照", emoji: "📸", color: "#e84393" },
  { id: "nightlife", label: "夜生活",   emoji: "🌙", color: "#2d3436" },
  { id: "festival",  label: "節慶活動", emoji: "🎉", color: "#e17055" },
  { id: "cycling",   label: "單車騎行", emoji: "🚴", color: "#00b894" },
  { id: "local",     label: "在地體驗", emoji: "🏘️",  color: "#F5A623" },
  { id: "budget",    label: "省錢旅行", emoji: "💰", color: "#6c7a89" },
  { id: "luxury",    label: "奢華享受", emoji: "💎", color: "#9b59b6" },
  { id: "light",     label: "輕旅行",   emoji: "✈️", color: "#3abdff" },
  { id: "beach",     label: "海灘度假", emoji: "🏖️",  color: "#0984e3" },
];

const STAY_TAGS: TagDef[] = [
  { id: "bnb",      label: "民宿",    emoji: "🏡",  color: "#FF8C42" },
  { id: "hostel",   label: "背包旅館", emoji: "🎒", color: "#7f8c8d" },
  { id: "business", label: "商務飯店", emoji: "🏢", color: "#636e72" },
  { id: "boutique", label: "精品旅館", emoji: "✨", color: "#c9a227" },
  { id: "camping",  label: "露營",    emoji: "⛺",  color: "#38b26d" },
  { id: "unique",   label: "特色住宿", emoji: "🏛️",  color: "#e17055" },
  { id: "seaview",  label: "海景房",  emoji: "🌊", color: "#3abdff" },
  { id: "mountain", label: "山間小屋", emoji: "🏔️",  color: "#00b894" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-[6px]">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === step - 1 ? 48 : 12,
            height: 6,
            borderRadius: 3,
            background:
              i < step - 1 ? "#3abdff" : i === step - 1 ? "#3abdff" : "#e8e8e8",
            opacity: i < step - 1 ? 0.45 : 1,
            transition: "width 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

function TagChip({
  tag,
  selected,
  onToggle,
  delay,
}: {
  tag: TagDef;
  selected: boolean;
  onToggle: () => void;
  delay: number;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        height: 40,
        padding: "0 14px 0 10px",
        borderRadius: 20,
        border: selected ? "none" : "1.5px solid #e8e8e8",
        background: selected ? tag.color : "white",
        color: selected ? "white" : "#4d4d4d",
        fontSize: 13,
        fontWeight: selected ? 600 : 400,
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: selected
          ? `0px 3px 10px ${tag.color}55`
          : "0px 1px 4px rgba(0,0,0,0.06)",
        animation: `tagIn 0.32s ease ${delay}s both`,
        whiteSpace: "nowrap",
        transform: "translateZ(0)",
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1 }}>{tag.emoji}</span>
      <span>{tag.label}</span>
    </button>
  );
}

function SectionLabel({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#8c8c8c", letterSpacing: "0.01em" }}>
        {label}
      </span>
    </div>
  );
}

function LeftPanel() {
  return (
    <aside
      className="hidden md:flex flex-col relative overflow-hidden flex-shrink-0"
      style={{ width: 440, background: PANEL_BG, backgroundColor: "#f6dea0" }}
    >
      <div style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.22)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 100, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.16)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 120, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.20)", pointerEvents: "none" }} />

      <div className="absolute flex items-center gap-2" style={{ top: 38, left: 31 }}>
        <div className="rounded-[12px] overflow-hidden flex-shrink-0" style={{ width: 48, height: 48, background: "#3a6329" }}>
          <Image src="/taibear-icon-trimmed.png" alt="Taibear" width={64} height={64} className="object-cover" />
        </div>
        <span className="text-[22px] font-bold" style={{ color: "#3abdff" }}>Taibear</span>
      </div>

      <div className="absolute" style={{ top: 180, left: -8, width: "105%", height: 460 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TAIPEI_IMG} alt="Taipei" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <div className="absolute" style={{ bottom: 96, left: 40 }}>
        <p className="font-bold text-white" style={{ fontSize: 32, lineHeight: 1.2 }}>歡迎加入 Taibear！</p>
        <p className="font-semibold" style={{ fontSize: 18, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>讓我們先認識你</p>
      </div>
      <p className="absolute text-[13px]" style={{ bottom: 24, left: 40, color: "rgba(255,255,255,0.45)" }}>© 2026 Taibear</p>
    </aside>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingQuizPage() {
  const router = useRouter();
  const setUserPreferences = useAppStore((s) => s.setUserPreferences);

  const [selectedTravel, setSelectedTravel] = useState<Set<string>>(new Set());
  const [selectedStay, setSelectedStay]     = useState<Set<string>>(new Set());
  const [reelsUrl, setReelsUrl]             = useState("");

  const toggleTravel = (id: string) =>
    setSelectedTravel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleStay = (id: string) =>
    setSelectedStay((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleContinue = async () => {
    const travelTags = TRAVEL_TAGS.filter((t) => selectedTravel.has(t.id)).map((t) => `#${t.label}`);
    const stayTags   = STAY_TAGS.filter((t) => selectedStay.has(t.id)).map((t) => `#${t.label}`);
    const allTags    = [...travelTags, ...stayTags];

    setUserPreferences({
      categories: { travel: travelTags, stay: stayTags },
      selectedTags: allTags,
      completedAt: new Date().toISOString(),
      reelsUrl: reelsUrl || undefined,
    });

    try { await postUserTags("me", allTags); } catch { /* non-blocking */ }
    router.push("/onboarding/hidden-spot");
  };

  return (
    <>
      <style>{`
        @keyframes tagIn {
          from { opacity: 0; transform: scale(0.85) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex min-h-screen md:h-screen">
        <LeftPanel />

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col min-h-screen" style={{ background: CONIC_BG }}>

          {/* Top bar */}
          <div className="flex items-center justify-between px-5 md:px-10 pt-10 pb-4">
            <div className="flex items-center gap-3">
              <StepDots step={2} total={3} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#b0b0b0" }}>2 / 3</span>
            </div>
            <button
              onClick={() => router.push("/trips")}
              style={{ fontSize: 13, color: "#8c8c8c", background: "none", border: "none", cursor: "pointer" }}
            >
              略過
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 md:px-10 pb-36">
            <div className="max-w-[860px] mx-auto">

              {/* Title */}
              <div style={{ animation: "fadeUp 0.38s ease 0.05s both", opacity: 0 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: "#141414", marginBottom: 6 }}>
                  你喜歡什麼樣的旅遊體驗？
                </h1>
                <p style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 24 }}>
                  選越多，我們越了解你 — 可以多選
                </p>
              </div>

              {/* ── 兩欄 tag 區塊：desktop 左右並排，mobile 垂直堆疊 ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

                {/* 旅遊偏好 card */}
                <div
                  style={{
                    borderRadius: 20,
                    padding: "20px 20px 16px",
                    background: "rgba(255,255,255,0.62)",
                    border: "1px solid rgba(255,255,255,0.85)",
                    backdropFilter: "blur(8px)",
                    animation: "fadeUp 0.38s ease 0.1s both",
                    opacity: 0,
                  }}
                >
                  <SectionLabel emoji="✈️" label="旅遊偏好" />
                  <div className="flex flex-wrap gap-2">
                    {TRAVEL_TAGS.map((tag, i) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        selected={selectedTravel.has(tag.id)}
                        onToggle={() => toggleTravel(tag.id)}
                        delay={0.14 + i * 0.025}
                      />
                    ))}
                  </div>
                </div>

                {/* 住宿偏好 card */}
                <div
                  style={{
                    borderRadius: 20,
                    padding: "20px 20px 16px",
                    background: "rgba(255,255,255,0.62)",
                    border: "1px solid rgba(255,255,255,0.85)",
                    backdropFilter: "blur(8px)",
                    animation: "fadeUp 0.38s ease 0.18s both",
                    opacity: 0,
                  }}
                >
                  <SectionLabel emoji="🏠" label="住宿偏好" />
                  <div className="flex flex-wrap gap-2">
                    {STAY_TAGS.map((tag, i) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        selected={selectedStay.has(tag.id)}
                        onToggle={() => toggleStay(tag.id)}
                        delay={0.46 + i * 0.025}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* ── IG Reels card ── */}
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "linear-gradient(135deg, rgba(237,210,255,0.72) 0%, rgba(210,232,255,0.72) 100%)",
                  border: "1.5px solid rgba(190,155,255,0.28)",
                  marginBottom: 10,
                  animation: "fadeUp 0.38s ease 0.7s both",
                  opacity: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 12px" }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #ff9433 0%, #ff6b8f 50%, #9466e5 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 15,
                  }}>
                    ▶
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#141414", marginBottom: 3 }}>
                      最近讓你心動的 IG Reels 是什麼？
                    </p>
                    <p style={{ fontSize: 12, color: "#8c8c8c" }}>
                      貼上影片連結，我們幫你找同款旅遊地點 ✨
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                  <input
                    value={reelsUrl}
                    onChange={(e) => setReelsUrl(e.target.value)}
                    placeholder="https://www.instagram.com/reel/..."
                    style={{
                      flex: 1, height: 42, borderRadius: 10, padding: "0 12px",
                      fontSize: 12, outline: "none", background: "white",
                      border: "1.5px solid rgba(190,155,255,0.38)", color: "#141414",
                    }}
                  />
                  <button
                    style={{
                      width: 64, height: 42, borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg, #ff9433, #ff6b8f, #9466e5)",
                      color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    貼上
                  </button>
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#999", paddingLeft: 2, animation: "fadeUp 0.38s ease 0.82s both", opacity: 0 }}>
                🍔 美食 Reels、景點打卡、民宿推薦⋯ 任何讓你心動的都行！
              </p>

            </div>
          </div>

          {/* ── Fixed bottom CTA ── */}
          <div
            className="fixed bottom-0 left-0 right-0 md:left-[440px] px-5 pb-8 pt-4"
            style={{ background: "linear-gradient(to top, rgba(255,255,255,0.96) 68%, transparent)" }}
          >
            <button
              onClick={() => void handleContinue()}
              style={{
                display: "block",
                width: "100%",
                maxWidth: 480,
                margin: "0 auto",
                height: 54,
                borderRadius: 28,
                border: "none",
                background: "linear-gradient(90deg, #3abdff 0%, #9cd8ed 55%, #fef3da 100%)",
                color: "white",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0px 4px 18px rgba(58,189,255,0.38)",
                letterSpacing: "0.01em",
              }}
            >
              繼續 →
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
