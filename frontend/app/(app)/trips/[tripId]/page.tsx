"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { agentService, tripsService } from "@/services/api/services";
import type { EnrichResponse, EnrichedPlace, Trip, TripStop } from "@/services/api/types";
import { getSession } from "@/services/auth/session";
import { clearCurrentTripId, setCurrentTripId } from "@/services/trips/currentTrip";

const CONIC_BG = "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

type PanelType = "spot" | "transport";
interface PanelState { type: PanelType; stopIdx: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDayDate(dateStr: string): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 星期${days[d.getDay()]}`;
}

function getCategoryChip(stop: TripStop): { label: string; bg: string; color: string } {
  const r = (stop.reasoning + " " + stop.name).toLowerCase();
  if (r.includes("住宿") || r.includes("飯店") || r.includes("hotel")) return { label: "安全住宿", bg: "#e0f4ff", color: "#3abdff" };
  if (r.includes("隱藏") || r.includes("秘") || r.includes("私藏")) return { label: "隱藏景點", bg: "#fef3da", color: "#e6a500" };
  if (r.includes("夜市") || r.includes("宵夜")) return { label: "美食", bg: "#fef3da", color: "#e6a500" };
  if (r.includes("美食") || r.includes("餐") || r.includes("吃") || r.includes("市場")) return { label: "美食", bg: "#fef3da", color: "#e6a500" };
  if (r.includes("購物") || r.includes("商場") || r.includes("逛")) return { label: "購物", bg: "#e0f4ff", color: "#3abdff" };
  return { label: "文化", bg: "#e0f4ff", color: "#3abdff" };
}

function getStopEmoji(stop: TripStop): string {
  const r = (stop.reasoning + " " + stop.name).toLowerCase();
  if (r.includes("住宿") || r.includes("飯店")) return "🏨";
  if (r.includes("夜市")) return "🌙";
  if (r.includes("美食") || r.includes("餐") || r.includes("午餐") || r.includes("晚餐")) return "🍜";
  if (r.includes("購物") || r.includes("商場")) return "🛍️";
  if (r.includes("廟") || r.includes("寺")) return "🏮";
  if (r.includes("咖啡") || r.includes("café")) return "☕";
  if (r.includes("公園") || r.includes("山") || r.includes("自然")) return "🌿";
  if (r.includes("碼頭") || r.includes("河")) return "🏮";
  return "📍";
}

function getTransitLabel(idx: number): string {
  const modes = ["🚶 步行 8 分", "🚶 步行 3 分", "🚌 公車 12 分", "🚶 步行 5 分", "🚊 捷運 6 分", "🚶 步行 10 分"];
  return modes[idx % modes.length];
}

function isHiddenSpot(stop: TripStop): boolean {
  return (stop.reasoning + " " + stop.name).toLowerCase().includes("隱藏");
}

function tripToPlannedRoute(trip: Trip) {
  const stops = [...(trip.stops || [])].sort((a, b) => a.step_order - b.step_order);
  return {
    route_id: trip.original_route_id || `trip-${trip.trip_id}`,
    route_name: trip.route_name || `行程 ${trip.trip_id}`,
    theme: trip.theme || "城市探索",
    google_maps_url: trip.google_maps_url || "",
    tsp_evaluation: trip.tsp_evaluation ?? { total_transit_time_mins: 0, smoothness_score: 0 },
    waypoints: stops.map(stop => ({
      step_order: stop.step_order, name: stop.name, place_id: stop.place_id,
      location: stop.location, suggested_time: stop.suggested_time, reasoning: stop.reasoning,
    })),
  };
}

// ── Mock placeholder data ────────────────────────────────────────────────────

const MOCK_REVIEWERS = [
  { name: "背包客Mia", badgeText: "旅遊達人", cardBg: "#fff0d6", emoji: "🧳",
    text: "傍晚去碼頭看夕陽超美！茶葉、南北貨都很推薦 🌅", likes: "4.2k" },
  { name: "攝影師Ken", badgeText: "攝影達人", cardBg: "#e0ebff", emoji: "📸",
    text: "光線絕美！早晨的斜光配上老建築，這裡是攝影聖地", likes: "2.8k" },
];

const MOCK_COMMENTS = [
  { name: "小玲", avatar: "👩", time: "3 天前", text: "第一次來，完全愛上這裡！強烈推薦 ❤️", verified: false },
  { name: "旅行者Jerry", avatar: "👨", time: "1 週前", text: "交通很方便，整個氛圍超棒，拍照超好看！", verified: true },
  { name: "Sophia", avatar: "👩‍🦱", time: "2 週前", text: "帶外國朋友來，他們都超喜歡！超讚 🎉", verified: false },
];

const TRANSPORT_OPTIONS = [
  { label: "步行 8 分鐘", detail: "🚶 8 分鐘" },
  { label: "捷運 5 分鐘", detail: "🚶 1 分鐘 → 🚊 大橋頭 → 🚶 2 分鐘" },
  { label: "公車 10 分鐘", detail: "🚌 公車 → 🚶 步行 2 分鐘" },
];

// ── PhotoCard ─────────────────────────────────────────────────────────────────

function PhotoCard({ bg, caption, sub, likes, height }: {
  bg: string; caption: string; sub: string; likes: string; height: number;
}) {
  return (
    <div className="relative rounded-[14px] overflow-hidden" style={{ height, background: bg, flexShrink: 0 }}>
      <div className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)" }} />
      <p className="absolute bottom-[18px] left-[10px] text-white font-semibold text-[12px]">{caption}</p>
      <p className="absolute bottom-[6px] left-[10px] text-white text-[9px]" style={{ opacity: 0.75 }}>{sub}</p>
      <div className="absolute top-2 right-2 rounded-[11px] px-2 h-[22px] flex items-center"
        style={{ background: "rgba(0,0,0,0.3)" }}>
        <span className="text-white text-[10px] font-medium">♥ {likes}</span>
      </div>
    </div>
  );
}

// ── SpotDetailPanel ───────────────────────────────────────────────────────────

function SpotDetailPanel({ stop, enrichedPlace }: {
  stop: TripStop;
  enrichedPlace: EnrichedPlace | null;
}) {
  const hidden = isHiddenSpot(stop);
  const chip = getCategoryChip(stop);
  const photoCount = enrichedPlace?.photos.length ?? 138;

  return (
    <div className="px-5 pt-5 pb-16">
      {/* Hidden spot tag */}
      {hidden && (
        <div className="inline-flex items-center mb-4 px-4 h-[43px] rounded-[20px]"
          style={{ background: "#ffd26a" }}>
          <span className="text-white font-semibold text-[20px]">我家巷口隱藏美食</span>
        </div>
      )}

      {/* Stop header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-[12px] h-[12px] rounded-full flex-shrink-0" style={{ background: "#ffd26a" }} />
        <p className="text-[16px] font-semibold text-[#141414]">{stop.name}</p>
      </div>
      <p className="text-[11px] mb-5 ml-5" style={{ color: "#999" }}>
        ⭐ 4.8 · 1,284 人造訪 · {chip.label}
      </p>

      {/* Photo wall header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-[#141414]">🖼️ 照片牆</p>
        <div className="rounded-[13px] px-3 h-[26px] flex items-center"
          style={{ background: "rgba(0,0,0,0.4)" }}>
          <span className="text-white text-[10px] font-medium">📷 {photoCount} 張</span>
        </div>
      </div>

      {/* Photo wall — 2-column masonry */}
      <div className="flex gap-3 mb-5">
        <div className="flex flex-col gap-3" style={{ flex: "0 0 calc(50% - 6px)" }}>
          <PhotoCard bg="#b8d1bf" caption={stop.name} sub="日落黃金時刻" likes="2.4k" height={175} />
          <PhotoCard bg="#e0c7ad" caption="巴洛克街屋" sub="百年建築立面" likes="891" height={130} />
        </div>
        <div className="flex flex-col gap-3" style={{ flex: "0 0 calc(50% - 6px)" }}>
          <PhotoCard bg="#e5d9b2" caption="麻油麵線" sub="必吃在地小吃" likes="1.7k" height={130} />
          <PhotoCard bg="#bfa6c7" caption="霞海城隍廟" sub="百年古廟香火" likes="956" height={175} />
        </div>
      </div>

      {/* User recommendations */}
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[13px] font-semibold text-[#141414]">✨ 用戶推薦</p>
        <p className="text-[10px]" style={{ color: "#999" }}>3 位旅遊達人分享</p>
      </div>
      <div className="flex gap-3 mb-5">
        {MOCK_REVIEWERS.map(r => (
          <div key={r.name} className="flex-1 min-w-0 rounded-[14px] overflow-hidden p-4"
            style={{ background: r.cardBg, boxShadow: "0px 4px 16px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-2 mb-2">
              <span style={{ fontSize: 20 }}>{r.emoji}</span>
              <div>
                <p className="text-[12px] font-semibold text-[#141414]">{r.name}</p>
                <div className="inline-flex items-center mt-0.5 px-1.5 h-[16px] rounded-[8px]"
                  style={{ background: "#e0f4ff" }}>
                  <span className="text-[8px] font-medium" style={{ color: "#3abdff" }}>{r.badgeText}</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] leading-[1.5]" style={{ color: "#4d4d4d" }}>{r.text}</p>
            <p className="text-right text-[10px] mt-2 font-medium" style={{ color: "#ff6b8f" }}>♥ {r.likes}</p>
          </div>
        ))}
      </div>

      {/* Comments */}
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[13px] font-semibold text-[#141414]">💬 旅遊夥伴怎麼說</p>
        <p className="text-[10px]" style={{ color: "#999" }}>共 284 則留言</p>
      </div>
      <div className="flex gap-3">
        {MOCK_COMMENTS.map(c => (
          <div key={c.name} className="flex-1 min-w-0 bg-white rounded-[12px] p-3"
            style={{ boxShadow: "0px 4px 16px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 16 }}>{c.avatar}</span>
              <div>
                <p className="text-[11px] font-semibold text-[#141414]">{c.name}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {c.verified && (
                    <div className="inline-flex items-center px-1.5 h-[14px] rounded-[7px]"
                      style={{ background: "#e0f4ff" }}>
                      <span className="text-[7px] font-medium" style={{ color: "#3abdff" }}>✓ 認證</span>
                    </div>
                  )}
                  <p className="text-[9px]" style={{ color: "#999" }}>{c.time}</p>
                </div>
              </div>
            </div>
            <p className="text-[10px] leading-[1.4]" style={{ color: "#4d4d4d" }}>{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TransportPanel ────────────────────────────────────────────────────────────

function TransportPanel({ fromStop, toStop }: { fromStop: TripStop; toStop: TripStop }) {
  return (
    <div className="px-5 pt-5 pb-16">
      {/* Route header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-[12px] h-[12px] rounded-full flex-shrink-0" style={{ background: "#ffd26a" }} />
        <p className="text-[16px] font-semibold text-[#141414]">{fromStop.name} → {toStop.name}</p>
      </div>

      {/* Map placeholder */}
      <div className="rounded-[14px] flex flex-col items-center justify-center mb-5"
        style={{ height: 255, background: "#b8d1bf", boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" }}>
        <p className="font-normal text-[20px]" style={{ color: "rgba(255,255,255,0.75)" }}>地圖</p>
        <p style={{ fontSize: 40 }}>🗺️</p>
      </div>

      {/* Transport options */}
      <p className="text-[13px] font-semibold text-[#141414] mb-3">選擇交通方式</p>
      <div className="flex flex-col gap-3 mb-5">
        {TRANSPORT_OPTIONS.map(opt => (
          <button key={opt.label} className="w-full bg-white rounded-[12px] text-left overflow-hidden"
            style={{ boxShadow: "0px 4px 16px rgba(0,0,0,0.05)", cursor: "pointer" }}>
            <div className="px-6 pt-5 pb-4">
              <p className="text-[13px] font-semibold text-[#141414] mb-3">{opt.label}</p>
              <div className="border-t mb-3" style={{ borderColor: "#f0f0f0" }} />
              <p className="text-[13px] font-semibold text-[#141414]">{opt.detail}</p>
            </div>
          </button>
        ))}
      </div>

      {/* More routes button */}
      <div className="flex justify-center">
        <button className="h-[40px] rounded-[12px] text-white text-[13px] font-semibold"
          style={{ width: 350, maxWidth: "100%", background: "#3abdff", boxShadow: "0px 4px 16px rgba(0,0,0,0.05)" }}>
          更多路線
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TripResultPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const session = useMemo(() => getSession(), []);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [enrichData, setEnrichData] = useState<EnrichResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PanelState>({ type: "spot", stopIdx: 0 });
  const [panelVisible, setPanelVisible] = useState(false);
  const [mobileTab, setMobileTab] = useState<"itinerary" | "detail">("detail");
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchPanel = (next: PanelState) => {
    if (panel.type === next.type && panel.stopIdx === next.stopIdx) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setPanelVisible(false);
    transitionRef.current = setTimeout(() => {
      setPanel(next);
      setPanelVisible(true);
    }, 190);
  };

  const handleStopClick = (idx: number) => {
    switchPanel({ type: "spot", stopIdx: idx });
    setMobileTab("detail");
  };

  const handleTransitClick = (idx: number) => {
    switchPanel({ type: "transport", stopIdx: idx });
    setMobileTab("detail");
  };

  const handleReplan = () => {
    const userId = session?.userId || trip?.user_id;
    if (userId) {
      clearCurrentTripId(userId);
    }
    router.push("/trips?mode=plan");
  };

  useEffect(() => {
    async function load() {
      try {
        const tripData = await tripsService.getTrip(tripId);
        setTrip(tripData);
        if (session?.userId) {
          setCurrentTripId(session.userId, tripData.trip_id);
        } else if (tripData.user_id) {
          setCurrentTripId(tripData.user_id, tripData.trip_id);
        }
        setLoading(false);
        setTimeout(() => setPanelVisible(true), 120);
        agentService.enrich([tripToPlannedRoute(tripData)])
          .then(e => setEnrichData(e))
          .catch(() => {});
      } catch {
        setLoading(false);
      }
    }
    void load();
    return () => { if (transitionRef.current) clearTimeout(transitionRef.current); };
  }, [session?.userId, tripId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: CONIC_BG }}>
        <div className="text-center">
          <p style={{ fontSize: 56, animation: "bearBounce 0.9s ease infinite" }}>🐻</p>
          <p className="text-[16px] font-semibold text-[#141414] mt-4">載入行程中...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: CONIC_BG }}>
        <div className="text-center">
          <p style={{ fontSize: 48 }}>😕</p>
          <p className="text-[16px] font-semibold text-[#141414] mt-4">找不到這個行程</p>
          <button onClick={() => router.push("/trips")}
            className="mt-4 px-6 h-[42px] rounded-[12px] text-white text-[14px] font-semibold"
            style={{ background: "#3abdff" }}>
            返回行程列表
          </button>
        </div>
      </div>
    );
  }

  const orderedStops = [...(trip.stops || [])].sort((a, b) => a.step_order - b.step_order);

  // Find enriched place for current stop
  const currentStop = orderedStops[panel.stopIdx] ?? orderedStops[0];
  const enrichedPlace: EnrichedPlace | null = (() => {
    if (!enrichData || !currentStop) return null;
    for (const route of Object.values(enrichData.routes)) {
      const found = route.places.find(p =>
        p.place_id === currentStop.place_id || p.place_name === currentStop.name
      );
      if (found) return found;
    }
    return null;
  })();

  return (
    <>
      <style>{`
        @keyframes bearBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
      `}</style>

      {/* ── Desktop two-pane layout ──────────────────────────────────────── */}
      <div className="hidden md:flex flex-col" style={{ height: "100vh" }}>
        {/* Header bar */}
        <div className="flex items-center bg-white flex-shrink-0 h-[60px] px-5 gap-3"
          style={{ borderBottom: "1px solid #f0f0f0" }}>
          <button onClick={() => router.push("/trips")}
            className="w-[32px] h-[32px] flex items-center justify-center text-[20px] text-[#141414] flex-shrink-0">
            ←
          </button>
          <p className="text-[15px] font-semibold text-[#141414] truncate">
            🌸 {trip.route_name || `行程 ${trip.trip_id}`}
          </p>
          <button
            onClick={handleReplan}
            className="ml-auto h-[34px] px-4 rounded-[10px] text-white text-[12px] font-semibold"
            style={{ background: "#3abdff" }}
          >
            重新規劃
          </button>
        </div>

        {/* Day tabs */}
        <div className="flex items-center bg-white flex-shrink-0 h-[50px] px-5 gap-1 overflow-x-auto"
          style={{ borderBottom: "1px solid #f0f0f0" }}>
          {["總覽", "第1天"].map((tab, i) => (
            <button key={tab} className="flex-shrink-0 relative h-full flex items-center px-4"
              style={{ color: i === 1 ? "#3abdff" : "#999", fontSize: 14, fontWeight: i === 1 ? 600 : 400 }}>
              {tab}
              {i === 1 && (
                <div className="absolute bottom-0 left-4 right-4 h-[3px] rounded-[2px]"
                  style={{ background: "#3abdff" }} />
              )}
            </button>
          ))}
          <button className="flex-shrink-0 ml-3 w-[28px] h-[28px] rounded-[14px] flex items-center justify-center text-white text-[16px] font-bold"
            style={{ background: "#3abdff" }}>+</button>
          <span className="flex-shrink-0 text-[18px] ml-1 select-none" style={{ color: "#999" }}>−</span>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left pane — stop timeline */}
          <div className="flex-shrink-0 overflow-y-auto pt-4 pb-6"
            style={{ width: 520, background: "#faf7f5", borderRight: "1px solid #f0f0f0" }}>
            {/* Date header card */}
            <div className="mx-5 mb-3 bg-white rounded-[12px] px-4 h-[50px] flex items-center justify-between"
              style={{ boxShadow: "0px 2px 6px rgba(0,0,0,0.05)" }}>
              <span className="text-[14px] font-semibold text-[#141414]">📅 {formatDayDate(trip.trip_date)}</span>
              <span className="text-[12px]" style={{ color: "#999" }}>{orderedStops.length} 個景點</span>
            </div>

            {/* Stop list */}
            <div className="mx-5">
              {orderedStops.map((stop, i) => {
                const isSelected = panel.type === "spot" && panel.stopIdx === i;
                const isLast = i === orderedStops.length - 1;
                const chip = getCategoryChip(stop);
                const emoji = getStopEmoji(stop);

                return (
                  <div key={stop.stop_id} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute z-10" style={{
                      left: 0, top: 23,
                      width: 12, height: 12, borderRadius: "50%",
                      background: isLast ? "transparent" : "#3abdff",
                      border: isLast ? "2px solid #ccc" : "none",
                    }} />
                    {/* Connector line */}
                    {!isLast && (
                      <div className="absolute" style={{ left: 5, top: 35, width: 2, height: 82, background: "#f0f0f0" }} />
                    )}

                    {/* Stop card */}
                    <div style={{ paddingLeft: 24 }}>
                      <button
                        className="w-full h-[54px] bg-white rounded-[14px] flex items-center gap-3 px-4 text-left mt-1"
                        style={{
                          boxShadow: isSelected ? "0px 2px 12px rgba(58,189,255,0.25)" : "0px 2px 8px rgba(0,0,0,0.06)",
                          border: `2px solid ${isSelected ? "#3abdff" : "transparent"}`,
                          transition: "border-color 0.18s ease, box-shadow 0.18s ease",
                        }}
                        onClick={() => handleStopClick(i)}
                      >
                        <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#141414] truncate">{stop.name}</p>
                          <p className="text-[11px]" style={{ color: "#999" }}>{stop.suggested_time || "時間待定"}</p>
                        </div>
                        <span className="px-2.5 h-[22px] rounded-[11px] text-[10px] font-medium flex items-center flex-shrink-0"
                          style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
                        <span className="text-[16px] flex-shrink-0" style={{ color: "#ccc" }}>⋮</span>
                      </button>

                      {/* Transit chip */}
                      {!isLast && (
                        <div className="mt-1 mb-1" style={{ paddingLeft: 52 }}>
                          <button
                            className="h-[26px] px-3 rounded-[13px] text-[11px] flex items-center"
                            style={{ background: "#f2f2f2", color: "#999", transition: "background 0.15s, color 0.15s" }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = "#e0f4ff";
                              (e.currentTarget as HTMLButtonElement).style.color = "#3abdff";
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = "#f2f2f2";
                              (e.currentTarget as HTMLButtonElement).style.color = "#999";
                            }}
                            onClick={() => handleTransitClick(i)}
                          >
                            {getTransitLabel(i)}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel — detail view */}
          <div className="flex-1 relative overflow-hidden" style={{ background: CONIC_BG }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflowY: "auto",
                transform: panelVisible ? "translateX(0)" : "translateX(48px)",
                opacity: panelVisible ? 1 : 0,
                transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.26s ease",
              }}
            >
              {panel.type === "spot" && currentStop ? (
                <SpotDetailPanel stop={currentStop} enrichedPlace={enrichedPlace} />
              ) : panel.type === "transport" && orderedStops[panel.stopIdx] && orderedStops[panel.stopIdx + 1] ? (
                <TransportPanel
                  fromStop={orderedStops[panel.stopIdx]}
                  toStop={orderedStops[panel.stopIdx + 1]}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:hidden min-h-screen">
        {/* Header */}
        <div className="flex items-center bg-white h-[56px] px-4 gap-3 sticky top-0 z-10"
          style={{ borderBottom: "1px solid #f0f0f0" }}>
          <button onClick={() => router.push("/trips")} className="text-[20px] text-[#141414]">←</button>
          <p className="text-[14px] font-semibold text-[#141414] truncate flex-1">
            🌸 {trip.route_name || `行程 ${trip.trip_id}`}
          </p>
          <button
            onClick={handleReplan}
            className="h-[30px] px-3 rounded-[10px] text-white text-[11px] font-semibold"
            style={{ background: "#3abdff" }}
          >
            重新規劃
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="flex sticky z-10 bg-white" style={{ top: 56, borderBottom: "1px solid #f0f0f0" }}>
          {(["itinerary", "detail"] as const).map(tab => (
            <button key={tab} className="flex-1 h-[44px] text-[13px] font-semibold relative"
              style={{ color: mobileTab === tab ? "#3abdff" : "#999" }}
              onClick={() => setMobileTab(tab)}>
              {tab === "itinerary" ? "行程清單" : "景點詳情"}
              {mobileTab === tab && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-[3px] rounded-[2px]"
                  style={{ background: "#3abdff" }} />
              )}
            </button>
          ))}
        </div>

        {/* Mobile content */}
        {mobileTab === "itinerary" ? (
          <div className="flex-1 pt-4 pb-8" style={{ background: "#faf7f5" }}>
            <div className="mx-4 mb-3 bg-white rounded-[12px] px-4 h-[50px] flex items-center justify-between"
              style={{ boxShadow: "0px 2px 6px rgba(0,0,0,0.05)" }}>
              <span className="text-[14px] font-semibold text-[#141414]">📅 {formatDayDate(trip.trip_date)}</span>
              <span className="text-[12px]" style={{ color: "#999" }}>{orderedStops.length} 個景點</span>
            </div>
            <div className="mx-4">
              {orderedStops.map((stop, i) => {
                const isSelected = panel.type === "spot" && panel.stopIdx === i;
                const isLast = i === orderedStops.length - 1;
                const chip = getCategoryChip(stop);
                const emoji = getStopEmoji(stop);
                return (
                  <div key={stop.stop_id} className="relative">
                    <div className="absolute z-10" style={{
                      left: 0, top: 23, width: 12, height: 12, borderRadius: "50%",
                      background: isLast ? "transparent" : "#3abdff",
                      border: isLast ? "2px solid #ccc" : "none",
                    }} />
                    {!isLast && (
                      <div className="absolute" style={{ left: 5, top: 35, width: 2, height: 82, background: "#f0f0f0" }} />
                    )}
                    <div style={{ paddingLeft: 24 }}>
                      <button className="w-full h-[54px] bg-white rounded-[14px] flex items-center gap-3 px-4 text-left mt-1"
                        style={{
                          boxShadow: isSelected ? "0px 2px 12px rgba(58,189,255,0.25)" : "0px 2px 8px rgba(0,0,0,0.06)",
                          border: `2px solid ${isSelected ? "#3abdff" : "transparent"}`,
                          transition: "border-color 0.18s ease",
                        }}
                        onClick={() => handleStopClick(i)}>
                        <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#141414] truncate">{stop.name}</p>
                          <p className="text-[11px]" style={{ color: "#999" }}>{stop.suggested_time || "時間待定"}</p>
                        </div>
                        <span className="px-2.5 h-[22px] rounded-[11px] text-[10px] font-medium flex items-center flex-shrink-0"
                          style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
                      </button>
                      {!isLast && (
                        <div className="mt-1 mb-1" style={{ paddingLeft: 52 }}>
                          <button className="h-[26px] px-3 rounded-[13px] text-[11px]"
                            style={{ background: "#f2f2f2", color: "#999" }}
                            onClick={() => handleTransitClick(i)}>
                            {getTransitLabel(i)}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1" style={{ background: CONIC_BG }}>
            {panel.type === "spot" && currentStop ? (
              <SpotDetailPanel stop={currentStop} enrichedPlace={enrichedPlace} />
            ) : panel.type === "transport" && orderedStops[panel.stopIdx] && orderedStops[panel.stopIdx + 1] ? (
              <TransportPanel
                fromStop={orderedStops[panel.stopIdx]}
                toStop={orderedStops[panel.stopIdx + 1]}
              />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
