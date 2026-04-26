"use client";

import { useEffect, useMemo, useState } from "react";

import { DEMO_ITINERARIES } from "@/app/data/demo-itineraries";
import { GoogleMap } from "@/components/maps/google-map";
import { agentService, tripsService } from "@/services/api/services";
import { getSession } from "@/services/auth/session";
import { getCurrentTripId } from "@/services/trips/currentTrip";

const FILTERS = ["全部", "知名景點", "當前行程"];

type ExplorePlace = {
  id: string;
  name: string;
  address: string;
  info: string;
  emoji: string;
  color: string;
  position: { lat: number; lng: number };
  source: "landmark" | "trip";
};

const TAIPEI_CENTER = { lat: 25.033, lng: 121.5654 };

const LANDMARK_PLACES: ExplorePlace[] = [
  {
    id: "landmark-datong",
    name: "大稻埕",
    address: "迪化街一段，大同區",
    info: "⭐ 4.8 · 歷史文化 · 步行友善",
    emoji: "🏮",
    color: "#3abdff",
    position: { lat: 25.0559, lng: 121.5109 },
    source: "landmark",
  },
  {
    id: "landmark-ximending",
    name: "西門町",
    address: "萬華區武昌街一段",
    info: "⭐ 4.6 · 商圈逛街 · 夜生活",
    emoji: "🌃",
    color: "#f59e0b",
    position: { lat: 25.0422, lng: 121.5078 },
    source: "landmark",
  },
  {
    id: "landmark-yangmingshan",
    name: "陽明山",
    address: "北投區竹子湖路",
    info: "⭐ 4.7 · 自然健行 · 山景",
    emoji: "🌿",
    color: "#4db266",
    position: { lat: 25.1559, lng: 121.5467 },
    source: "landmark",
  },
  {
    id: "landmark-xinyi",
    name: "台北 101",
    address: "信義區信義路五段 7 號",
    info: "⭐ 4.7 · 城市地標 · 觀景",
    emoji: "🏙️",
    color: "#ef4444",
    position: { lat: 25.0339, lng: 121.5645 },
    source: "landmark",
  },
];

export default function ExplorePage() {
  const session = useMemo(() => getSession(), []);
  const [activeFilter, setActiveFilter] = useState("全部");
  const [tripPlaces, setTripPlaces] = useState<ExplorePlace[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string>(LANDMARK_PLACES[0].id);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentTripStops() {
      if (!session?.userId) {
        if (!cancelled) {
          setTripPlaces([]);
        }
        return;
      }

      const currentTripId = getCurrentTripId(session.userId);
      if (!currentTripId) {
        if (!cancelled) {
          setTripPlaces([]);
        }
        return;
      }

      try {
        const trip = currentTripId.startsWith("demo-")
          ? DEMO_ITINERARIES[currentTripId]
          : await tripsService.getTrip(currentTripId);

        if (!trip) {
          if (!cancelled) {
            setTripPlaces([]);
          }
          return;
        }

        const sortedStops = [...trip.stops].sort((a, b) => a.step_order - b.step_order);

        const unresolvedNames = sortedStops
          .filter((stop) => !Number.isFinite(stop.location.lat) || !Number.isFinite(stop.location.lng))
          .map((stop) => stop.name);

        const geocodeMap = new Map<string, { lat: number; lng: number }>();
        if (unresolvedNames.length > 0) {
          const geocoded = await agentService.geocode(unresolvedNames);
          for (const place of geocoded) {
            if (!place.found) {
              continue;
            }
            geocodeMap.set(place.name, { lat: place.lat, lng: place.lng });
          }
        }

        const mapped: ExplorePlace[] = sortedStops.slice(0, 6).map((stop) => {
          const fallback = geocodeMap.get(stop.name);
          const lat = Number.isFinite(stop.location.lat) ? stop.location.lat : (fallback?.lat ?? TAIPEI_CENTER.lat);
          const lng = Number.isFinite(stop.location.lng) ? stop.location.lng : (fallback?.lng ?? TAIPEI_CENTER.lng);
          return {
            id: `trip-${stop.stop_id}`,
            name: stop.name,
            address: "當前行程停靠點",
            info: `${stop.suggested_time || "時間待定"} · 行程第 ${stop.step_order} 站`,
            emoji: "🧭",
            color: "#6366f1",
            position: { lat, lng },
            source: "trip",
          };
        });

        if (!cancelled) {
          setTripPlaces(mapped);
        }
      } catch {
        if (!cancelled) {
          setTripPlaces([]);
        }
      }
    }

    void loadCurrentTripStops();

    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  const allPlaces = useMemo(() => [...LANDMARK_PLACES, ...tripPlaces], [tripPlaces]);

  const visiblePlaces = useMemo(() => {
    if (activeFilter === "知名景點") {
      return allPlaces.filter((place) => place.source === "landmark");
    }
    if (activeFilter === "當前行程") {
      return allPlaces.filter((place) => place.source === "trip");
    }
    return allPlaces;
  }, [activeFilter, allPlaces]);

  const selectedPlace = useMemo(
    () => allPlaces.find((place) => place.id === selectedPinId) ?? visiblePlaces[0] ?? null,
    [allPlaces, selectedPinId, visiblePlaces]
  );

  const markers = useMemo(
    () =>
      visiblePlaces.map((place) => ({
        id: place.id,
        title: place.name,
        label: place.source === "trip" ? "T" : undefined,
        color: place.id === selectedPlace?.id ? "#ff6b6b" : place.color,
        position: place.position,
      })),
    [selectedPlace?.id, visiblePlaces]
  );

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: "#dbe9d8" }}>
      <GoogleMap
        className="absolute inset-0"
        center={TAIPEI_CENTER}
        zoom={12}
        markers={markers}
        onMarkerClick={setSelectedPinId}
      />

      {/* ── Search bar + filters ── */}

      {/* Desktop */}
      <div className="hidden md:flex absolute top-6 left-10 items-center gap-3">
        <div className="bg-white h-[52px] w-[480px] rounded-[16px] flex items-center px-4 gap-2" style={{ boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.12)" }}>
          <span className="text-[16px]">🔍</span>
          <span className="text-[15px]" style={{ color: "#999" }}>搜尋地點、景點、餐廳...</span>
        </div>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className="h-[36px] px-4 rounded-[20px] text-[13px] font-semibold whitespace-nowrap transition-colors"
            style={activeFilter === f ? { background: "#3abdff", color: "white", boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.08)" } : { background: "white", color: "#222", boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.08)" }}>
            {f}
          </button>
        ))}
      </div>

      {/* Mobile: stacked search + scrollable filter row */}
      <div className="flex flex-col md:hidden absolute top-3 left-3 right-3 gap-2 z-10">
        <div className="bg-white h-[48px] rounded-[14px] flex items-center px-4 gap-2" style={{ boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.12)" }}>
          <span className="text-[15px]">🔍</span>
          <span className="text-[14px]" style={{ color: "#999" }}>搜尋地點、景點、餐廳...</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className="h-[34px] px-4 rounded-[20px] text-[12px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeFilter === f ? { background: "#3abdff", color: "white" } : { background: "white", color: "#222", boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.08)" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Place Detail Card ── */}
      {selectedPlace && (
        <div
          className="absolute bottom-4 left-4 right-4 md:left-10 md:right-auto md:w-[320px] md:bottom-6 bg-white rounded-[20px] p-5"
          style={{ boxShadow: "0px 8px 24px 0px rgba(0,0,0,0.12)" }}
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="text-[32px] leading-none">{selectedPlace.emoji}</span>
            <div>
              <p className="text-[18px] font-bold text-[#222]">{selectedPlace.name}</p>
              <p className="text-[13px] mt-0.5" style={{ color: "#999" }}>{selectedPlace.address}</p>
            </div>
          </div>
          <p className="text-[13px] text-[#222] mb-4">{selectedPlace.info}</p>
          <button className="w-full h-[40px] rounded-[12px] text-white text-[14px] font-semibold" style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}>
            加入行程 →
          </button>
        </div>
      )}

      {/* ── Map attribution ── */}
      <div className="absolute bottom-3 right-3 bg-white/80 rounded px-2 py-1">
        <p className="text-[10px]" style={{ color: "#999" }}>© Google Maps data</p>
      </div>
    </div>
  );
}
