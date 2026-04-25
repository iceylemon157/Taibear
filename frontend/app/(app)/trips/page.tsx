"use client";

import { useState } from "react";

const STYLE_TAGS = [
  { label: "🍜 美食探索", active: true },
  { label: "🏛 文化歷史", active: true },
  { label: "📸 網美打卡", active: true },
  { label: "🌿 親近自然", active: false },
  { label: "🛍 購物逛街", active: false },
  { label: "🎭 藝文展演", active: false },
  { label: "🌙 夜生活", active: false },
];

const REC_CARDS = [
  { emoji: "🏮", title: "大稻埕文化之旅", desc: "迪化街 · 霞海城隍廟 · 永樂市場", duration: "半天", tags: ["文化", "美食"] },
  { emoji: "🌿", title: "陽明山一日遊", desc: "冷水坑 · 擎天崗 · 花鐘", duration: "一天", tags: ["自然", "健行"] },
  { emoji: "🌃", title: "信義區夜生活", desc: "101 · 微風廣場 · 象山", duration: "傍晚", tags: ["打卡", "夜景"] },
  { emoji: "🍵", title: "貓空茶山漫步", desc: "貓空纜車 · 老茶館 · 山景", duration: "半天", tags: ["自然", "放鬆"] },
];

const BG_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><foreignObject x='0' y='0' width='1' height='1'><div xmlns='http://www.w3.org/1999/xhtml' style='background:conic-gradient(from 90deg, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%); width:100%; height:100%;'></div></foreignObject></svg>\")",
};

export default function TripsPage() {
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState(STYLE_TAGS);

  const toggleTag = (i: number) =>
    setTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, active: !t.active } : t)));

  return (
    <div className="min-h-screen flex" style={{ background: "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)" }}>
      {/* Left Column */}
      <div className="flex-1 px-12 py-12 flex flex-col gap-6 min-w-0">
        {/* Hero */}
        <div>
          <p className="text-[36px] font-bold leading-tight" style={{ color: "rgba(26,26,26,0.2)" }}>
            Taibear 帶你玩出
          </p>
          <p className="text-[36px] font-bold leading-tight" style={{ color: "#ffd26a" }}>
            Taipei 新旅行 ✦
          </p>
        </div>

        {/* Date Picker */}
        <div
          className="flex items-center h-[64px] rounded-[16px] border-[1.5px] bg-white px-5 gap-4 max-w-[415px]"
          style={{ borderColor: "#e0e0e0" }}
        >
          <span className="text-[18px]">📅</span>
          <div className="flex flex-col">
            <span className="text-[11px]" style={{ color: "#999" }}>出發日期</span>
            <span className="text-[15px] font-semibold text-black">2025/05/01</span>
          </div>
          <span className="text-[20px] font-semibold text-black mx-1">⭢</span>
          <div className="flex flex-col">
            <span className="text-[11px]" style={{ color: "#999" }}>結束日期</span>
            <span className="text-[15px] font-semibold text-black">2025/05/01</span>
          </div>
          <div className="w-px h-[40px] mx-2" style={{ background: "#e0e0e0" }} />
          <div className="flex flex-col">
            <span className="text-[11px]" style={{ color: "#999" }}>行程天數</span>
            <span className="text-[15px] font-semibold" style={{ color: "#3abdff" }}>3 天 2 夜</span>
          </div>
        </div>

        {/* Style Tags */}
        <div>
          <p className="text-[14px] font-semibold mb-3" style={{ color: "#999" }}>✦ 你的旅遊風格</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <button
                key={tag.label}
                onClick={() => toggleTag(i)}
                className="h-[36px] px-4 rounded-[20px] text-[13px] font-semibold border-[1.5px] transition-colors"
                style={
                  tag.active
                    ? { background: "#d0efff", borderColor: "#3abdff", color: "#3abdff" }
                    : { background: "white", borderColor: "#e0e0e0", color: "#1a1a1a", fontWeight: 400 }
                }
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input */}
        <div
          className="relative rounded-[20px] border-2 bg-white"
          style={{ borderColor: "#3abdff", minHeight: 160 }}
        >
          <textarea
            className="w-full h-[120px] pt-[18px] px-[18px] text-[15px] resize-none outline-none bg-transparent"
            style={{ color: "#1a1a1a" }}
            placeholder={"告訴 Taibear 這次旅程的任何想法...\n\n例如：想去大稻埕吃小吃、拍照，傍晚想看夕陽，不想走太多路 🐾"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            className="absolute bottom-3 right-3 w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-white text-[18px] font-bold"
            style={{ background: "#3abdff" }}
          >
            ↑
          </button>
        </div>

        {/* AI Planning Button */}
        <button
          className="w-full h-[56px] rounded-[16px] text-white text-[17px] font-semibold"
          style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}
        >
          ✦ AI 個人化規劃行程 →
        </button>

        <p className="text-[14px] text-center mt-auto pt-4" style={{ color: "#999" }}>
          @ 2026 Taibear
        </p>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch my-12" style={{ background: "#e0e0e0" }} />

      {/* Right Column */}
      <div className="w-[452px] px-8 py-12 flex flex-col gap-5 flex-shrink-0">
        {/* Ongoing Trip Card */}
        <div
          className="rounded-[20px] border-2 p-5 relative"
          style={{ background: "#fef3da", borderColor: "#f7d989", minHeight: 140 }}
        >
          <span
            className="inline-block px-4 h-[26px] rounded-[20px] text-[11px] font-semibold text-white leading-[26px]"
            style={{ background: "#ffd26a" }}
          >
            進行中 🔥
          </span>
          <p className="mt-2 text-[18px] font-bold text-black">大稻埕文化半日遊</p>
          <p className="text-[13px] mt-1" style={{ color: "#999" }}>
            📅 2025/04/26 · 📍 5 個景點 · ⏱ 約 5 小時
          </p>
          <button
            className="absolute bottom-4 right-4 px-4 h-[32px] rounded-[10px] text-white text-[12px] font-semibold"
            style={{ background: "#ffd26a" }}
          >
            繼續行程 →
          </button>
        </div>

        {/* Recommended Trips */}
        <p className="text-[16px] font-semibold text-black">✦ 精選推薦行程</p>
        <div className="grid grid-cols-2 gap-4">
          {REC_CARDS.map((card) => (
            <div
              key={card.title}
              className="bg-white rounded-[16px] p-4 cursor-pointer hover:shadow-md transition-shadow"
              style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-start justify-between">
                <span className="text-[28px]">{card.emoji}</span>
                <span
                  className="h-[22px] px-3 rounded-[20px] text-[11px] text-white leading-[22px]"
                  style={{ background: "#ffd26a" }}
                >
                  {card.duration}
                </span>
              </div>
              <p className="mt-3 text-[14px] font-semibold text-black">{card.title}</p>
              <p className="text-[11px] mt-1 leading-[16px]" style={{ color: "#999" }}>{card.desc}</p>
              <div className="flex gap-2 mt-3">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="h-[20px] px-3 rounded-[20px] text-[10px] leading-[20px]"
                    style={{ background: "#f6f1e5", color: "#999" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
