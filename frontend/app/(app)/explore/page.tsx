"use client";

import { useState } from "react";

const FILTERS = ["全部", "餐廳", "景點", "咖啡廳", "交通"];

const PINS = [
  { label: "📍 大稻埕", color: "#3abdff", left: "27%", top: "25%" },
  { label: "📍 寧夏夜市", color: "#ff9933", left: "43%", top: "34%" },
  { label: "📍 陽明山", color: "#4db266", left: "63%", top: "16%" },
  { label: "📍 西門町", color: "#3abdff", left: "35%", top: "47%" },
  { label: "📍 信義區", color: "#cc4d4d", left: "53%", top: "56%" },
];

const SELECTED_PLACE = {
  emoji: "🏮",
  name: "大稻埕",
  address: "迪化街一段，大同區",
  info: "⭐ 4.8  ·  歷史文化  ·  步行友善",
};

function MapPin({ label, color, left, top, onClick, active }: {
  label: string; color: string; left: string; top: string; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center transition-transform hover:scale-105"
      style={{ left, top, transform: "translateX(-50%)" }}
    >
      <div
        className="px-3 h-[36px] rounded-[20px] flex items-center whitespace-nowrap text-white text-[12px] font-semibold"
        style={{
          background: color,
          boxShadow: active
            ? `0 0 0 3px white, 0 0 0 5px ${color}`
            : "0px 4px 8px 0px rgba(0,0,0,0.2)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: 0, height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `8px solid ${color}`,
        }}
      />
    </button>
  );
}

export default function ExplorePage() {
  const [activeFilter, setActiveFilter] = useState("全部");
  const [selectedPin, setSelectedPin] = useState<string | null>("📍 大稻埕");

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: "#dbe9d8" }}>

      {/* ── Map grid (road lines) ── */}
      {/* Horizontal roads */}
      {["33%", "56%", "78%", "17%", "47%", "69%", "89%"].map((top, i) => (
        <div key={i} className="absolute left-0 right-0 bg-white"
          style={{ top, height: i < 3 ? 7 : 4, opacity: 1 }} />
      ))}
      {/* Vertical roads */}
      {["25%", "49%", "74%", "12%", "37%", "62%", "87%"].map((left, i) => (
        <div key={i} className="absolute top-0 bottom-0 bg-white"
          style={{ left, width: i < 3 ? 6 : 4, opacity: 1 }} />
      ))}

      {/* Green areas (parks) */}
      <div className="absolute rounded-sm" style={{ background: "#c0dfba", left: "6%", top: "7%", width: 180, height: 140 }} />
      <div className="absolute rounded-sm" style={{ background: "#c0dfba", left: "41%", top: "22%", width: 220, height: 160 }} />
      <div className="absolute rounded-sm" style={{ background: "#c0dfba", left: "74%", top: "44%", width: 160, height: 200 }} />
      <div className="absolute rounded-sm" style={{ background: "#c0dfba", left: "16%", top: "61%", width: 130, height: 110 }} />

      {/* Water (river) */}
      <div className="absolute" style={{ background: "#add8e6", left: "57%", top: 0, width: 80, height: "39%" }} />
      <div className="absolute" style={{ background: "#add8e6", left: "64%", top: 0, width: 40, height: "22%" }} />
      <div className="absolute" style={{ background: "#add8e6", left: "25%", top: "78%", width: "33%", height: 60 }} />

      {/* Buildings */}
      {[
        { l: "26%", t: "9%", w: 60, h: 40 }, { l: "33%", t: "11%", w: 80, h: 50 },
        { l: "13%", t: "31%", w: 100, h: 60 }, { l: "45%", t: "44%", w: 70, h: 50 },
        { l: "70%", t: "17%", w: 90, h: 55 }, { l: "82%", t: "28%", w: 110, h: 70 },
        { l: "90%", t: "67%", w: 80, h: 55 }, { l: "35%", t: "61%", w: 65, h: 45 },
      ].map((b, i) => (
        <div key={i} className="absolute rounded-[3px]"
          style={{ background: "#d6d6d1", left: b.l, top: b.t, width: b.w, height: b.h }} />
      ))}

      {/* ── Map pins ── */}
      {PINS.map((pin) => (
        <MapPin
          key={pin.label}
          {...pin}
          active={selectedPin === pin.label}
          onClick={() => setSelectedPin(pin.label === selectedPin ? null : pin.label)}
        />
      ))}

      {/* ── Search bar + filters ── */}
      <div className="absolute top-6 left-10 flex items-center gap-3">
        <div className="bg-white h-[52px] w-[480px] rounded-[16px] flex items-center px-4 gap-2"
          style={{ boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.12)" }}>
          <span className="text-[16px]">🔍</span>
          <span className="text-[15px]" style={{ color: "#999" }}>搜尋地點、景點、餐廳...</span>
        </div>

        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className="h-[36px] px-4 rounded-[20px] text-[13px] font-semibold whitespace-nowrap transition-colors"
            style={
              activeFilter === f
                ? { background: "#3abdff", color: "white", boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.08)" }
                : { background: "white", color: "#222", boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.08)" }
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Zoom controls ── */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 bg-white rounded-[12px] w-[40px] overflow-hidden flex flex-col items-center"
        style={{ boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.1)" }}>
        <button className="w-full h-[44px] text-[20px] font-bold text-[#222] hover:bg-gray-50 flex items-center justify-center">+</button>
        <div className="w-[30px] h-px bg-gray-200" />
        <button className="w-full h-[44px] text-[20px] font-bold text-[#222] hover:bg-gray-50 flex items-center justify-center">−</button>
      </div>

      {/* ── Place Detail Card ── */}
      {selectedPin && (
        <div className="absolute bottom-6 left-10 bg-white rounded-[20px] w-[320px] p-5"
          style={{ boxShadow: "0px 8px 24px 0px rgba(0,0,0,0.12)" }}>
          <div className="flex items-start gap-3 mb-4">
            <span className="text-[32px] leading-none">{SELECTED_PLACE.emoji}</span>
            <div>
              <p className="text-[18px] font-bold text-[#222]">{SELECTED_PLACE.name}</p>
              <p className="text-[13px] mt-0.5" style={{ color: "#999" }}>{SELECTED_PLACE.address}</p>
            </div>
          </div>
          <p className="text-[13px] text-[#222] mb-4">{SELECTED_PLACE.info}</p>
          <button
            className="w-full h-[40px] rounded-[12px] text-white text-[14px] font-semibold"
            style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}
          >
            加入行程 →
          </button>
        </div>
      )}

      {/* ── OSM attribution ── */}
      <div className="absolute bottom-3 right-3 bg-white/80 rounded px-2 py-1">
        <p className="text-[10px]" style={{ color: "#999" }}>© OpenStreetMap contributors</p>
      </div>
    </div>
  );
}
