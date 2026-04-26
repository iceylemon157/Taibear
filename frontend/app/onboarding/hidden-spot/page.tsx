"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/services/store/appStore";

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const PANEL_BG =
  "linear-gradient(180deg, rgba(255,210,106,0.9) 0%, rgba(156,200,181,0.85) 50%, rgba(58,189,255,0.9) 100%)";

const MAX_DESC = 200;

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

export default function HiddenSpotPage() {
  const router = useRouter();
  const setHiddenSpot = useAppStore((s) => s.setHiddenSpot);

  const [search, setSearch] = useState("");
  const [desc, setDesc] = useState("");
  const [visible, setVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  const handleSubmit = () => {
    setHiddenSpot({ name: search, description: desc, submittedAt: new Date().toISOString() });
    router.push("/trips");
  };

  const canSubmit = search.trim().length > 0 && desc.trim().length > 0;

  const SubmitBtn = ({ label = "分享我的秘密基地，開始探索" }: { label?: string }) => (
    <button
      onClick={handleSubmit}
      disabled={!canSubmit}
      className="w-full h-[56px] rounded-[28px] text-white text-[15px] font-semibold"
      style={{
        background: canSubmit
          ? "linear-gradient(90deg, #3abdff 0%, #9cd8ed 50%, #fef3da 100%)"
          : "#e8e8e8",
        color: canSubmit ? "white" : "#bbb",
        boxShadow: canSubmit ? "0px 4px 16px rgba(0,0,0,0.18)" : "none",
        border: "none",
        cursor: canSubmit ? "pointer" : "default",
        maxWidth: 560,
        display: "block",
        margin: "0 auto",
        transition: "background 0.25s, box-shadow 0.25s",
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex min-h-screen md:h-screen" style={{ background: CONIC_BG }}>

        {/* ── Left panel (desktop only) ── */}
        <aside
          className="hidden md:flex flex-col relative overflow-hidden flex-shrink-0"
          style={{ width: 440, background: PANEL_BG, backgroundColor: "#f6dea0" }}
        >
          <div style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.22)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 100, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.16)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 120, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />

          <div className="absolute flex items-center gap-2" style={{ top: 38, left: 31 }}>
            <div className="rounded-[12px] overflow-hidden flex-shrink-0" style={{ width: 48, height: 48, background: "#3a6329" }}>
              <Image src="/taibear-icon-trimmed.png" alt="Taibear" width={64} height={64} className="object-cover" />
            </div>
            <span className="text-[22px] font-bold" style={{ color: "#3abdff" }}>Taibear</span>
          </div>

          <div className="absolute" style={{ top: 180, left: -8, width: "105%", height: 460 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.figma.com/api/mcp/asset/2bccc14b-85b8-4242-b7de-6677e9eb2b41"
              alt="Taipei"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          <div className="absolute" style={{ bottom: 96, left: 40 }}>
            <p className="font-bold text-white" style={{ fontSize: 32, lineHeight: 1.2 }}>歡迎加入 Taibear！</p>
            <p className="font-semibold" style={{ fontSize: 18, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>讓我們先認識你</p>
          </div>
          <p className="absolute text-[13px]" style={{ bottom: 24, left: 40, color: "rgba(255,255,255,0.45)" }}>© 2026 Taibear</p>
        </aside>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col md:overflow-y-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 md:px-10 pt-10 pb-4">
            <StepDots step={3} total={3} />
            <button
              onClick={() => router.push("/trips")}
              style={{ fontSize: 13, color: "#8c8c8c", background: "none", border: "none", cursor: "pointer" }}
            >
              先進入 Taibear
            </button>
          </div>

          {/* Content */}
          <div
            className="flex-1 px-5 md:px-10 pb-32 md:pb-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(10px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            {/* Achievement badge (desktop: top-right) */}
            <div
              className="md:float-right md:ml-6 mb-5 md:mb-0 rounded-[20px] overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #fffae0, #fff0bd)",
                border: "1.5px solid #ffd94d",
                boxShadow: "0px 4px 12px rgba(0,0,0,0.1)",
                padding: "14px 16px",
                maxWidth: 320,
                animation: `fadeUp 0.4s ease 0.3s both`,
                opacity: 0,
              }}
            >
              <div className="flex items-start gap-3">
                <span style={{ fontSize: 28 }}>⭐</span>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#664700" }}>分享就能成為「隱藏景點達人」</p>
                  <p className="text-[12px] mt-1" style={{ color: "#735900", lineHeight: 1.5 }}>
                    如果有旅人造訪了你推薦的地方，<br />你會第一個收到通知，並獲得達人積分 🏆
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {[{ emoji: "🗺️", label: "探索達人" }, { emoji: "🍜", label: "美食推手" }, { emoji: "🏡", label: "住宿專家" }].map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1 rounded-[10px] py-2"
                    style={{ background: "rgba(255,255,255,0.7)" }}>
                    <span style={{ fontSize: 20 }}>{b.emoji}</span>
                    <span style={{ fontSize: 10, color: "#664d00", fontWeight: 500 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] mb-1 md:hidden" style={{ color: "#8c8c8c" }}>
              💡 例如：巷弄裡的無名麵攤、媽媽以前帶你去的老冰果室⋯
            </p>

            <h1 className="font-bold text-[#141414] mb-2" style={{ fontSize: 28 }}>我家巷口的隱藏景點🤫</h1>
            <p className="text-[15px] mb-1" style={{ color: "#4d4d4d" }}>那個朋友問你都說「不知道」，</p>
            <p className="text-[15px] mb-6" style={{ color: "#4d4d4d" }}>但其實你私心珍藏的寶藏小店</p>

            <p className="hidden md:block text-[12px] mb-4" style={{ color: "#8c8c8c" }}>
              💡 例如：巷弄裡的無名麵攤、媽媽以前帶你去的老冰果室⋯
            </p>

            {/* Search */}
            <p className="text-[13px] font-semibold mb-2" style={{ color: "#4d4d4d" }}>搜尋這個地方</p>
            <div
              className="flex items-center gap-3 mb-4 rounded-[16px] px-4"
              style={{ height: 56, background: "white", border: "1.5px solid #f0f0f0", boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}
            >
              <span style={{ fontSize: 20, color: "#ccc" }}>🔍</span>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋店名、地址或地標⋯"
                className="flex-1 outline-none text-[14px] text-[#141414]"
                style={{ background: "transparent", border: "none" }}
              />
            </div>

            {/* Map placeholder */}
            <div
              className="flex flex-col items-center justify-center mb-5 rounded-[16px]"
              style={{ height: 160, background: "#d9ebe0", boxShadow: "0px 2px 8px rgba(0,0,0,0.05)", color: "#80a694" }}
            >
              <span style={{ fontSize: 44 }}>🗺️</span>
              <p className="text-[13px] mt-2">在地圖上確認位置</p>
            </div>

            {/* Description */}
            <p className="text-[13px] font-semibold mb-2" style={{ color: "#4d4d4d" }}>為什麼這裡特別值得去？</p>
            <div
              className="relative mb-5 rounded-[16px] overflow-hidden"
              style={{ background: "white", border: "1.5px solid #f0f0f0", boxShadow: "0px 2px 6px rgba(0,0,0,0.04)" }}
            >
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value.slice(0, MAX_DESC))}
                placeholder={"說說你的故事——第一次去是什麼感覺？有什麼一定要點的招牌？\n這裡為什麼讓你一去再去？"}
                className="w-full outline-none resize-none text-[13px] text-[#141414]"
                rows={5}
                style={{ padding: "14px", border: "none", background: "transparent" }}
              />
              <p className="text-right text-[11px] px-4 pb-3" style={{ color: "#ccc" }}>
                {desc.length} / {MAX_DESC}
              </p>
            </div>

            {/* Photos */}
            <p className="text-[13px] font-semibold mb-3" style={{ color: "#4d4d4d" }}>加幾張照片（選填）</p>
            <div className="flex gap-3 mb-6">
              <button
                className="rounded-[14px] flex flex-col items-center justify-center gap-1"
                style={{ width: 80, height: 80, background: "#f0f0f0", border: "1.5px dashed #d1d1d1", cursor: "pointer" }}
              >
                <span style={{ fontSize: 24, color: "#b3b3b3", lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 10, color: "#8c8c8c" }}>上傳</span>
              </button>
              {[{ bg: "#e0f0ff", emoji: "🌃" }, { bg: "#f5e5ff", emoji: "🍜" }].map((p) => (
                <div key={p.emoji} className="rounded-[14px] flex items-center justify-center" style={{ width: 80, height: 80, background: p.bg }}>
                  <span style={{ fontSize: 34 }}>{p.emoji}</span>
                </div>
              ))}
            </div>

            {/* Desktop submit */}
            <div className="hidden md:block mt-2">
              <SubmitBtn />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed submit */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 px-5 pb-8 pt-3"
        style={{ background: "linear-gradient(to top, rgba(255,255,255,0.96) 65%, transparent)" }}
      >
        <SubmitBtn />
      </div>
    </>
  );
}
