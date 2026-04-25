"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/appStore";
import { postUserTags } from "@/lib/api/users";

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const PANEL_BG =
  "linear-gradient(180deg, rgba(255,210,106,0.9) 0%, rgba(156,200,181,0.85) 50%, rgba(58,189,255,0.9) 100%)";

const TAIPEI_IMG = "https://www.figma.com/api/mcp/asset/2bccc14b-85b8-4242-b7de-6677e9eb2b41";

const QUIZ = [
  {
    id: "q1",
    step: 1,
    category: "抵達與步調",
    en: "PACING & VIBE",
    emoji: "✈️",
    color: "#3abdff",
    scenario: "剛抵達目的地放下行李，離晚餐還有三個小時的空檔，這時你會⋯⋯",
    options: [
      {
        id: "a",
        letter: "A",
        emoji: "🗺️",
        text: "馬上打開地圖，衝去最近的必去景點或網美店打卡！",
        tags: ["#行程緊湊", "#社群打卡", "#熱門地標", "#早出晚歸", "#效率至上"],
      },
      {
        id: "b",
        letter: "B",
        emoji: "🚶",
        text: "換上輕便的衣服，去飯店附近的街區或老街隨意晃晃。",
        tags: ["#隨遇而安", "#深度慢遊", "#在地文化", "#巷弄探索", "#彈性時間"],
      },
      {
        id: "c",
        letter: "C",
        emoji: "🛏️",
        text: "什麼都不想，先撲到飯店的軟床上睡個午覺或使用設施。",
        tags: ["#極致放鬆", "#晚鳥作息", "#飯店設施", "#睡到自然醒", "#無行程漫步"],
      },
    ],
  },
  {
    id: "q2",
    step: 2,
    category: "美食與預算",
    en: "FOOD & BUDGET",
    emoji: "🍜",
    color: "#ff9f43",
    scenario: "夜幕低垂，肚子餓了，對於今晚的第一頓大餐，你的直覺是？",
    options: [
      {
        id: "a",
        letter: "A",
        emoji: "🥢",
        text: "穿梭在夜市或巷弄間，把所有在地小吃吃過一輪！",
        tags: ["#在地小吃", "#街頭美食", "#高CP值", "#夜市巡禮", "#銅板價"],
      },
      {
        id: "b",
        letter: "B",
        emoji: "🍷",
        text: "找一間氣氛極佳的餐酒館或居酒屋，微醺放鬆一下。",
        tags: ["#微醺之夜", "#餐酒館", "#居酒屋", "#注重氣氛", "#中等預算"],
      },
      {
        id: "c",
        letter: "C",
        emoji: "⭐",
        text: "早就訂好高檔餐廳（或米其林），準備享受一場味覺饗宴。",
        tags: ["#極致饗宴", "#米其林指南", "#無菜單料理", "#預算充足", "#精緻餐飲"],
      },
      {
        id: "d",
        letter: "D",
        emoji: "☕",
        text: "尋找有特色的老宅咖啡廳或甜點名店，先吃甜的再說！",
        tags: ["#特色咖啡廳", "#甜點名店", "#老宅改建", "#打卡餐廳", "#網美店"],
      },
    ],
  },
  {
    id: "q3",
    step: 3,
    category: "景點與主題",
    en: "ATTRACTIONS & THEME",
    emoji: "🌟",
    color: "#26de81",
    scenario: "隔天一早，天氣超級好！你最想把時間花在⋯⋯",
    options: [
      {
        id: "a",
        letter: "A",
        emoji: "🏔️",
        text: "擁抱大自然！去爬山、看海或是走進森林。",
        tags: ["#自然秘境", "#高山健行", "#海島沙灘", "#國家公園", "#戶外活動"],
      },
      {
        id: "b",
        letter: "B",
        emoji: "🏛️",
        text: "穿梭歷史與藝術！參觀博物館、美術館或壯觀的古蹟。",
        tags: ["#歷史古蹟", "#藝文展覽", "#博物館", "#文創園區", "#知性之旅"],
      },
      {
        id: "c",
        letter: "C",
        emoji: "🎢",
        text: "體驗當地的瘋狂！去遊樂園、特色主題館或是瘋狂血拼。",
        tags: ["#主題娛樂", "#遊樂園", "#血拼購物", "#大型商場", "#城市夜生活"],
      },
    ],
  },
  {
    id: "q4",
    step: 4,
    category: "機動性與旅伴",
    en: "MOBILITY & COMPANIONS",
    emoji: "🧭",
    color: "#a29bfe",
    scenario: "這次旅行出門在外，你最理想的移動與相處狀態是？",
    options: [
      {
        id: "a",
        letter: "A",
        emoji: "🎒",
        text: "一個人或兩個人，背著包包搭捷運或租機車到處鑽！",
        tags: ["#獨自冒險", "#浪漫雙人", "#大眾運輸", "#機車租借", "#高機動性"],
      },
      {
        id: "b",
        letter: "B",
        emoji: "👨‍👩‍👧",
        text: "帶著長輩或小孩，最好能包車或自駕，舒舒服服到定點。",
        tags: ["#親子同遊", "#家族旅遊", "#自駕遊", "#無障礙空間", "#育嬰友善"],
      },
      {
        id: "c",
        letter: "C",
        emoji: "🍻",
        text: "一大群好朋友包棟出遊，熱熱鬧鬧最重要！",
        tags: ["#三五好友", "#包車旅遊", "#包廂餐廳", "#多人分享餐", "#熱鬧氣氛"],
      },
    ],
  },
] as const;

type QuizId = (typeof QUIZ)[number]["id"];
type Answers = Partial<Record<QuizId, string>>;

// ── Shared left panel ────────────────────────────────────────────────────────

function LeftPanel() {
  return (
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

// ── Result Screen ────────────────────────────────────────────────────────────

function ResultScreen({
  answers,
  onSubmit,
  onRetry,
}: {
  answers: Answers;
  onSubmit: (reelsUrl: string) => void;
  onRetry: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [reelsUrl, setReelsUrl] = useState("");
  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  const groups = QUIZ.map((q) => {
    const optionId = answers[q.id];
    const option = q.options.find((o) => o.id === optionId);
    return { q, option };
  }).filter((g) => g.option);

  const allTags = [...new Set(groups.flatMap((g) => g.option!.tags))];

  return (
    <>
      <style>{`
        @keyframes resultUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tagPop {
          0%   { opacity: 0; transform: scale(0.7); }
          70%  { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="flex min-h-screen md:h-screen">
      <LeftPanel />
      <div className="flex-1 min-h-screen flex flex-col md:overflow-y-auto" style={{ background: CONIC_BG }}>
        {/* Header */}
        <div
          className="flex flex-col items-center pt-14 pb-6 px-5"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-[36px] mb-4"
            style={{ background: "white", boxShadow: "0px 6px 20px rgba(0,0,0,0.1)" }}
          >
            🎉
          </div>
          <h1 className="text-[26px] font-bold text-[#141414]">你的旅遊輪廓</h1>
          <p className="text-[14px] mt-1" style={{ color: "#999" }}>
            AI 將根據以下標籤為你量身打造行程
          </p>
        </div>

        {/* Tag groups */}
        <div className="flex-1 px-5 overflow-y-auto pb-40">
          {groups.map(({ q, option }, gi) => (
            <div
              key={q.id}
              className="mb-4"
              style={{
                animation: mounted ? `resultUp 0.5s ease ${gi * 0.1}s both` : "none",
                opacity: mounted ? undefined : 0,
              }}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <span style={{ fontSize: "16px" }}>{q.emoji}</span>
                <span className="text-[12px] font-semibold" style={{ color: "#999" }}>
                  {q.category}
                </span>
                <span className="text-[12px]" style={{ color: "#ccc" }}>
                  選項 {option!.letter}
                </span>
              </div>

              <div
                className="rounded-[20px] px-4 py-4"
                style={{ background: "white", boxShadow: "0px 2px 12px rgba(0,0,0,0.06)" }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span style={{ fontSize: "20px" }}>{option!.emoji}</span>
                  <p className="text-[13px] text-[#141414] leading-relaxed">{option!.text}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {option!.tags.map((tag, ti) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-[12px] font-medium"
                      style={{
                        animation: mounted ? `tagPop 0.4s ease ${gi * 0.1 + ti * 0.05}s both` : "none",
                        opacity: mounted ? undefined : 0,
                        background: `${q.color}18`,
                        color: q.color === "#ff9f43" ? "#c4620a" : q.color === "#26de81" ? "#0d8a4a" : q.color === "#a29bfe" ? "#5a52c2" : "#0086c3",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* ── Reels section ── */}
          <div
            className="mb-4"
            style={{ animation: mounted ? `resultUp 0.5s ease 0.45s both` : "none", opacity: mounted ? undefined : 0 }}
          >
            <div className="rounded-[20px] overflow-hidden" style={{ background: "linear-gradient(135deg, #faedff 0%, #e0f2ff 100%)", border: "1.5px solid #d9bfff" }}>
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <div className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 text-[18px] text-white"
                  style={{ background: "linear-gradient(135deg, #ff9433, #ff6b8f, #9466e5)" }}>
                  ▶
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#141414]">最近讓你心動的 IG Reels 是什麼？</p>
                  <p className="text-[12px]" style={{ color: "#8c8c8c" }}>貼上影片連結，我們幫你找同款旅遊地點 ✨</p>
                </div>
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <input
                  value={reelsUrl}
                  onChange={(e) => setReelsUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  className="flex-1 h-[42px] rounded-[10px] px-3 text-[12px] outline-none"
                  style={{ border: "1.5px solid #d9bfff", color: "#141414" }}
                />
                <button
                  onClick={() => {/* just visual for now */}}
                  className="w-[64px] h-[42px] rounded-[10px] text-white text-[13px] font-semibold flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #ff9433, #ff6b8f, #9466e5)", border: "none", cursor: "pointer" }}
                >
                  貼上
                </button>
              </div>
            </div>
            <p className="text-[12px] mt-2 px-1" style={{ color: "#808080" }}>
              🍔 美食 Reels、景點打卡、民宿推薦⋯ 任何讓你心動的都行！
            </p>
          </div>
        </div>

        {/* Bottom actions */}
        <div
          className="fixed bottom-0 left-0 right-0 md:left-[440px] px-5 pb-8 pt-4"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,0.95) 70%, transparent)" }}
        >
          <button
            onClick={() => onSubmit(reelsUrl)}
            className="w-full max-w-[480px] mx-auto h-[56px] rounded-[18px] text-white text-[16px] font-bold flex items-center justify-center gap-2 block"
            style={{ background: "#3abdff", boxShadow: "0px 6px 24px rgba(58,189,255,0.4)" }}
          >
            繼續 →
          </button>
          <button
            onClick={onRetry}
            className="w-full max-w-[480px] mx-auto mt-3 text-[14px] text-center block"
            style={{ color: "#999", background: "none", border: "none", cursor: "pointer" }}
          >
            重新作答
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

// ── Main Quiz Page ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const setUserPreferences = useAppStore((s) => s.setUserPreferences);

  const [displayedQ, setDisplayedQ] = useState(0);
  const [pendingQ, setPendingQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [exitDir, setExitDir] = useState<"" | "left" | "right">("");
  const [showResult, setShowResult] = useState(false);
  const enterDirRef = useRef<"right" | "left">("right");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const question = QUIZ[displayedQ];
  const selectedId = answers[question.id];
  const isLast = displayedQ === QUIZ.length - 1;
  const canAdvance = !!selectedId;

  const transition = (toQ: number, dir: "left" | "right") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    enterDirRef.current = dir === "left" ? "right" : "left";
    setPendingQ(toQ);
    setExitDir(dir);
    timerRef.current = setTimeout(() => {
      setDisplayedQ(toQ);
      setExitDir("");
    }, 260);
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) { setShowResult(true); return; }
    transition(displayedQ + 1, "left");
  };

  const goBack = () => {
    if (displayedQ === 0) return;
    transition(displayedQ - 1, "right");
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleSubmit = async (reelsUrl: string) => {
    const categories: Record<string, string[]> = {};
    const allTags: string[] = [];
    QUIZ.forEach((q) => {
      const optId = answers[q.id];
      const opt = q.options.find((o) => o.id === optId);
      if (opt) { categories[q.id] = [...opt.tags]; allTags.push(...opt.tags); }
    });
    setUserPreferences({ categories, selectedTags: [...new Set(allTags)], completedAt: new Date().toISOString(), reelsUrl: reelsUrl || undefined });
    try { await postUserTags("me", [...new Set(allTags)]); } catch { /* non-blocking */ }
    router.push("/onboarding/hidden-spot");
  };

  if (showResult) {
    return (
      <ResultScreen
        answers={answers}
        onSubmit={handleSubmit}
        onRetry={() => { setAnswers({}); setDisplayedQ(0); setPendingQ(0); setShowResult(false); }}
      />
    );
  }

  const animClass = exitDir
    ? exitDir === "left" ? "q-exit-left" : "q-exit-right"
    : enterDirRef.current === "right" ? "q-enter-right" : "q-enter-left";

  const accentColor = question.color;

  return (
    <>
      <style>{`
        @keyframes slideInRight  { from { opacity:0; transform:translateX(36px);  } to { opacity:1; transform:translateX(0); } }
        @keyframes slideInLeft   { from { opacity:0; transform:translateX(-36px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideOutLeft  { from { opacity:1; transform:translateX(0); }  to { opacity:0; transform:translateX(-36px); } }
        @keyframes slideOutRight { from { opacity:1; transform:translateX(0); }  to { opacity:0; transform:translateX(36px);  } }
        @keyframes optionIn      { from { opacity:0; transform:translateY(10px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes btnAppear     { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .q-enter-right { animation: slideInRight  0.32s ease both; }
        .q-enter-left  { animation: slideInLeft   0.32s ease both; }
        .q-exit-left   { animation: slideOutLeft  0.26s ease both; }
        .q-exit-right  { animation: slideOutRight 0.26s ease both; }
      `}</style>

      <div className="flex min-h-screen md:h-screen">
      <LeftPanel />
      <div className="flex-1 min-h-screen flex flex-col" style={{ background: CONIC_BG }}>

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 pt-10 pb-3 max-w-[480px] w-full mx-auto">
          {/* Back */}
          <button
            onClick={goBack}
            style={{
              opacity: displayedQ > 0 ? 1 : 0,
              pointerEvents: displayedQ > 0 ? "auto" : "none",
              transition: "opacity 0.2s ease",
              background: "white",
              border: "none",
              borderRadius: "12px",
              width: "38px",
              height: "38px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0px 2px 8px rgba(0,0,0,0.08)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="2.2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-[6px]">
            {QUIZ.map((q, i) => (
              <div
                key={q.id}
                style={{
                  width: i === displayedQ ? "22px" : "7px",
                  height: "7px",
                  borderRadius: "4px",
                  background: i < displayedQ ? accentColor : i === displayedQ ? accentColor : "#e0e0e0",
                  opacity: i < displayedQ ? 0.45 : 1,
                  transition: "width 0.35s ease, background 0.3s ease, opacity 0.3s ease",
                }}
              />
            ))}
          </div>

          {/* Counter */}
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#999", width: "38px", textAlign: "right" }}>
            {displayedQ + 1}/{QUIZ.length}
          </span>
        </div>

        {/* ── Animated question area ── */}
        <div
          key={displayedQ}
          className={`flex-1 flex flex-col px-5 pt-2 pb-4 max-w-[480px] w-full mx-auto ${animClass}`}
        >
          {/* Category label */}
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: "28px" }}>{question.emoji}</span>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: accentColor }}>
                {question.en}
              </p>
              <p style={{ fontSize: "20px", fontWeight: 700, color: "#141414", lineHeight: 1.2 }}>
                {question.category}
              </p>
            </div>
          </div>

          {/* Scenario card */}
          <div
            className="rounded-[20px] px-5 py-4 mb-4"
            style={{ background: "white", boxShadow: "0px 4px 16px rgba(0,0,0,0.06)" }}
          >
            <p style={{ fontSize: "15px", color: "#141414", lineHeight: 1.65, fontWeight: 500 }}>
              {question.scenario}
            </p>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-[10px]">
            {question.options.map((opt, i) => {
              const isSelected = selectedId === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: opt.id }))}
                  style={{
                    animation: `optionIn 0.3s ease ${0.05 + i * 0.07}s both`,
                    background: isSelected ? `${accentColor}12` : "white",
                    border: `2px solid ${isSelected ? accentColor : "transparent"}`,
                    borderRadius: "18px",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: isSelected
                      ? `0px 4px 16px ${accentColor}30`
                      : "0px 2px 8px rgba(0,0,0,0.06)",
                    transition: "border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
                    width: "100%",
                  }}
                >
                  {/* Letter badge */}
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: isSelected ? accentColor : "#f2f2f2",
                      color: isSelected ? "white" : "#999",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "background 0.18s ease, color 0.18s ease",
                    }}
                  >
                    {opt.letter}
                  </div>

                  {/* Emoji */}
                  <span style={{ fontSize: "22px", flexShrink: 0 }}>{opt.emoji}</span>

                  {/* Text */}
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#141414",
                      lineHeight: 1.5,
                      flex: 1,
                      fontWeight: isSelected ? 600 : 400,
                      transition: "font-weight 0.1s ease",
                    }}
                  >
                    {opt.text}
                  </span>

                  {/* Check */}
                  <div
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? accentColor : "#e0e0e0"}`,
                      background: isSelected ? accentColor : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.18s ease",
                    }}
                  >
                    {isSelected && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Fixed bottom button ── */}
        <div
          className="fixed bottom-0 left-0 right-0 md:left-[440px] px-5 pb-8 pt-3"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,0.96) 65%, transparent)" }}
        >
          <button
            onClick={goNext}
            disabled={!canAdvance}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "480px",
              margin: "0 auto",
              height: "54px",
              borderRadius: "17px",
              border: "none",
              background: canAdvance ? accentColor : "#e8e8e8",
              color: canAdvance ? "white" : "#bbb",
              fontSize: "16px",
              fontWeight: 700,
              cursor: canAdvance ? "pointer" : "default",
              boxShadow: canAdvance ? `0px 6px 20px ${accentColor}45` : "none",
              transition: "background 0.25s ease, box-shadow 0.25s ease, color 0.25s ease",
              animation: canAdvance ? "btnAppear 0.3s ease both" : "none",
            }}
          >
            {isLast ? "查看結果 →" : "下一題 →"}
          </button>
        </div>

      </div>
      </div>
    </>
  );
}
