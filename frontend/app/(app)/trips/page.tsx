"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api/client";
import { agentService, tripsService } from "@/services/api/services";
import type { Trip } from "@/services/api/types";
import { getSession } from "@/services/auth/session";

const STYLE_TAGS = [
  { label: "🍜 美食探索", active: true },
  { label: "🏛 文化歷史", active: true },
  { label: "📸 網美打卡", active: true },
  { label: "🌿 親近自然", active: false },
  { label: "🛍 購物逛街", active: false },
  { label: "🎭 藝文展演", active: false },
  { label: "🌙 夜生活", active: false },
];

const FALLBACK_REC_CARDS = [
  { emoji: "🏮", title: "大稻埕文化之旅", desc: "迪化街 · 霞海城隍廟 · 永樂市場", duration: "半天", tags: ["文化", "美食"] },
  { emoji: "🌿", title: "陽明山一日遊", desc: "冷水坑 · 擎天崗 · 花鐘", duration: "一天", tags: ["自然", "健行"] },
  { emoji: "🌃", title: "信義區夜生活", desc: "101 · 微風廣場 · 象山", duration: "傍晚", tags: ["打卡", "夜景"] },
  { emoji: "🍵", title: "貓空茶山漫步", desc: "貓空纜車 · 老茶館 · 山景", duration: "半天", tags: ["自然", "放鬆"] },
];

const CONIC_BG = "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const ACTIVE_TRIP_STATUSES = new Set(["active", "planned", "disrupted", "replanning"]);

function cleanTagLabel(label: string): string {
  const cleaned = label.replace(/^[^\s]+\s*/u, "").trim();
  return cleaned || label;
}

function formatDateLabel(dateLike: string | undefined): string {
  if (!dateLike) {
    return "未指定";
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return dateLike;
  }
  return date.toISOString().slice(0, 10);
}

function toDurationLabel(stopCount: number): string {
  if (stopCount >= 6) {
    return "一天";
  }
  if (stopCount >= 4) {
    return "半天";
  }
  return "輕旅";
}

function tripToRecCard(trip: Trip) {
  return {
    emoji: "🧭",
    title: trip.route_name || `行程 ${trip.trip_id}`,
    desc: `${trip.theme || "城市探索"} · ${trip.stops.length} 個景點`,
    duration: toDurationLabel(trip.stops.length),
    tags: [trip.theme || "旅遊", trip.status],
  };
}

export default function TripsPage() {
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState(STYLE_TAGS);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const session = useMemo(() => getSession(), []);

  const selectedTagNames = useMemo(
    () => tags.filter((tag) => tag.active).map((tag) => cleanTagLabel(tag.label)),
    [tags]
  );

  const ongoingTrip = useMemo(
    () => trips.find((trip) => ACTIVE_TRIP_STATUSES.has(trip.status)),
    [trips]
  );

  const recCards = useMemo(
    () => (trips.length > 0 ? trips.slice(0, 4).map(tripToRecCard) : FALLBACK_REC_CARDS),
    [trips]
  );

  const toggleTag = (i: number) =>
    setTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, active: !t.active } : t)));

  async function refreshTrips() {
    if (!session?.userId) {
      return;
    }

    setLoadingTrips(true);
    setErrorMessage("");

    try {
      const summary = await tripsService.listUserTripIds(session.userId);
      const details = await Promise.all(
        summary.trip_ids.map(async (tripId) => {
          try {
            return await tripsService.getTrip(tripId);
          } catch {
            return null;
          }
        })
      );

      const validTrips = details
        .filter((trip): trip is Trip => trip !== null)
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

      setTrips(validTrips);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("讀取行程失敗，請稍後再試。");
      }
    } finally {
      setLoadingTrips(false);
    }
  }

  async function handleCreateTrip() {
    if (!session?.userId) {
      setErrorMessage("請先登入再建立行程。");
      return;
    }

    const query = prompt.trim();
    if (!query) {
      setErrorMessage("請先輸入旅程想法。");
      return;
    }

    setPlanning(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const searchResult = await agentService.search({
        query,
        user_id: session.userId,
        tags: selectedTagNames,
      });

      const plan = await agentService.plan(searchResult);
      const chosenRoute = plan.recommended_routes?.[0];

      if (!chosenRoute) {
        throw new Error("AI 尚未產生可建立的行程。");
      }

      const tripDate = new Date().toISOString().slice(0, 10);
      const trip = await tripsService.createTrip({
        user_id: session.userId,
        trip_date: tripDate,
        chosen_route: chosenRoute,
      });

      setSuccessMessage(`已建立行程：${trip.route_name || trip.trip_id}`);
      setPrompt("");
      await refreshTrips();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("建立行程失敗，請稍後再試。");
      }
    } finally {
      setPlanning(false);
    }
  }

  useEffect(() => {
    void refreshTrips();
  }, [session?.userId]);

  return (
    <div className="min-h-screen" style={{ background: CONIC_BG }}>

      {/* ── Desktop: two-column layout ──────────────────────────────── */}
      <div className="hidden md:flex min-h-screen">
        {/* Left column */}
        <div className="flex-1 px-12 py-12 flex flex-col gap-6 min-w-0">
          <div>
            <p className="text-[36px] font-bold leading-tight" style={{ color: "rgba(26,26,26,0.2)" }}>Taibear 帶你玩出</p>
            <p className="text-[36px] font-bold leading-tight" style={{ color: "#ffd26a" }}>Taipei 新旅行 ✦</p>
          </div>

          <DatePicker />

          <div>
            <p className="text-[14px] font-semibold mb-3" style={{ color: "#999" }}>✦ 你的旅遊風格</p>
            <TagRow tags={tags} onToggle={toggleTag} />
          </div>

          <PromptBox value={prompt} onChange={setPrompt} onSubmit={handleCreateTrip} disabled={planning} />

          <AIPlanButton onClick={handleCreateTrip} loading={planning} disabled={planning} />

          {errorMessage ? (
            <p className="text-[13px]" style={{ color: "#d9534f" }}>
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="text-[13px]" style={{ color: "#2ebf59" }}>
              {successMessage}
            </p>
          ) : null}

          <p className="text-[14px] text-center mt-auto pt-4" style={{ color: "#999" }}>© 2026 Taibear</p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch my-12" style={{ background: "#e0e0e0" }} />

        {/* Right column */}
        <div className="w-[452px] px-8 py-12 flex flex-col gap-5 flex-shrink-0">
          <OngoingTripCard trip={ongoingTrip} loading={loadingTrips} onRefresh={refreshTrips} />
          <p className="text-[16px] font-semibold text-black">✦ 精選推薦行程</p>
          <div className="grid grid-cols-2 gap-4">
            {recCards.map((card) => <RecCard key={`${card.title}-${card.desc}`} {...card} />)}
          </div>
        </div>
      </div>

      {/* ── Mobile: single-column layout ────────────────────────────── */}
      <div className="flex flex-col md:hidden px-4 py-6 gap-5">
        {/* Hero text */}
        <div>
          <p className="text-[36px] font-bold leading-tight" style={{ color: "rgba(26,26,26,0.2)" }}>Taibear 帶你玩出</p>
          <p className="text-[36px] font-bold leading-tight" style={{ color: "#ffd26a" }}>Taipei 新旅行 ✦</p>
        </div>

        <DatePicker />

        <div>
          <p className="text-[14px] font-semibold mb-3" style={{ color: "#999" }}>✦ 你的旅遊風格</p>
          <TagRow tags={tags} onToggle={toggleTag} mobile />
        </div>

        <PromptBox value={prompt} onChange={setPrompt} onSubmit={handleCreateTrip} disabled={planning} />

        <AIPlanButton onClick={handleCreateTrip} loading={planning} disabled={planning} />

        {errorMessage ? (
          <p className="text-[13px]" style={{ color: "#d9534f" }}>
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-[13px]" style={{ color: "#2ebf59" }}>
            {successMessage}
          </p>
        ) : null}

        <OngoingTripCard trip={ongoingTrip} loading={loadingTrips} onRefresh={refreshTrips} />

        <p className="text-[16px] font-semibold text-black">✦ 精選推薦行程</p>
        <div className="flex flex-col gap-4">
          {recCards.map((card) => <RecCard key={`${card.title}-${card.desc}`} {...card} />)}
        </div>

        <p className="text-[14px] text-center py-2" style={{ color: "#999" }}>© 2026 Taibear</p>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DatePicker() {
  return (
    <div
      className="flex items-center h-[64px] rounded-[16px] border-[1.5px] bg-white px-4 gap-3"
      style={{ borderColor: "#e0e0e0" }}
    >
      <span className="text-[18px]">📅</span>
      <div className="flex flex-col">
        <span className="text-[11px]" style={{ color: "#999" }}>出發日期</span>
        <span className="text-[15px] font-semibold text-black">2025/05/01</span>
      </div>
      <span className="text-[20px] font-semibold text-black">⭢</span>
      <div className="flex flex-col">
        <span className="text-[11px]" style={{ color: "#999" }}>結束日期</span>
        <span className="text-[15px] font-semibold text-black">2025/05/01</span>
      </div>
      <div className="hidden sm:block w-px h-[40px] mx-1" style={{ background: "#e0e0e0" }} />
      <div className="hidden sm:flex flex-col">
        <span className="text-[11px]" style={{ color: "#999" }}>行程天數</span>
        <span className="text-[15px] font-semibold" style={{ color: "#3abdff" }}>3 天 2 夜</span>
      </div>
    </div>
  );
}

function TagRow({ tags, onToggle, mobile }: { tags: typeof STYLE_TAGS; onToggle: (i: number) => void; mobile?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-2 ${mobile ? "gap-y-2" : ""}`}>
      {tags.map((tag, i) => (
        <button
          key={tag.label}
          onClick={() => onToggle(i)}
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
  );
}

function PromptBox({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="relative rounded-[20px] border-2 bg-white" style={{ borderColor: "#3abdff", minHeight: 140 }}>
      <textarea
        className="w-full h-[100px] pt-[18px] px-[18px] text-[15px] resize-none outline-none bg-transparent"
        style={{ color: "#1a1a1a" }}
        placeholder={"告訴 Taibear 這次旅程的任何想法...\n\n例如：想去大稻埕吃小吃、拍照，傍晚想看夕陽，不想走太多路 🐾"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="absolute bottom-3 right-3 w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-white text-[18px] font-bold"
        style={{ background: "#3abdff" }}
      >
        ↑
      </button>
    </div>
  );
}

function AIPlanButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-[56px] rounded-[16px] text-white text-[17px] font-semibold disabled:opacity-70"
      style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}
    >
      {loading ? "正在規劃行程..." : "✦ AI 個人化規劃行程 →"}
    </button>
  );
}

function OngoingTripCard({
  trip,
  loading,
  onRefresh,
}: {
  trip?: Trip;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div
        className="rounded-[20px] border-2 p-4"
        style={{ background: "#fef3da", borderColor: "#f7d989", minHeight: 130 }}
      >
        <p className="text-[13px]" style={{ color: "#999" }}>讀取行程中...</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div
        className="rounded-[20px] border-2 p-4 relative"
        style={{ background: "#fef3da", borderColor: "#f7d989", minHeight: 130 }}
      >
        <span
          className="inline-block px-4 h-[26px] rounded-[20px] text-[11px] font-semibold text-white leading-[26px]"
          style={{ background: "#ffd26a" }}
        >
          尚無行程
        </span>
        <p className="mt-2 text-[18px] font-bold text-black">建立你的第一條 AI 行程</p>
        <p className="text-[13px] mt-1" style={{ color: "#999" }}>
          輸入需求後，Taibear 會自動搜尋並建立可用路線。
        </p>
      </div>
    );
  }

  const stopCount = trip.stops?.length ?? 0;

  return (
    <div
      className="rounded-[20px] border-2 p-4 relative"
      style={{ background: "#fef3da", borderColor: "#f7d989", minHeight: 130 }}
    >
      <span
        className="inline-block px-4 h-[26px] rounded-[20px] text-[11px] font-semibold text-white leading-[26px]"
        style={{ background: "#ffd26a" }}
      >
        {trip.status === "active" ? "進行中 🔥" : "已建立 ✨"}
      </span>
      <p className="mt-2 text-[18px] font-bold text-black">{trip.route_name || `行程 ${trip.trip_id}`}</p>
      <p className="text-[13px] mt-1" style={{ color: "#999" }}>
        📅 {formatDateLabel(trip.trip_date)} · 📍 {stopCount} 個景點 · 🧭 {trip.theme || "城市探索"}
      </p>
      <button
        onClick={onRefresh}
        className="absolute bottom-4 right-4 px-4 h-[32px] rounded-[10px] text-white text-[12px] font-semibold"
        style={{ background: "#ffd26a" }}
      >
        更新資料 ↻
      </button>
    </div>
  );
}

function RecCard({ emoji, title, desc, duration, tags }: {
  emoji: string; title: string; desc: string; duration: string; tags: string[];
}) {
  return (
    <div
      className="bg-white rounded-[16px] p-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-start justify-between">
        <span className="text-[28px]">{emoji}</span>
        <span className="h-[22px] px-3 rounded-[20px] text-[11px] text-white leading-[22px]"
          style={{ background: "#ffd26a" }}>
          {duration}
        </span>
      </div>
      <p className="mt-3 text-[14px] font-semibold text-black">{title}</p>
      <p className="text-[11px] mt-1 leading-[16px]" style={{ color: "#999" }}>{desc}</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        {tags.map((tag) => (
          <span key={tag} className="h-[20px] px-3 rounded-[20px] text-[10px] leading-[20px]"
            style={{ background: "#f6f1e5", color: "#999" }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
