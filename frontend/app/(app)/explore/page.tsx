"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DEMO_ITINERARIES } from "@/app/data/demo-itineraries";
import { GoogleMap, ensureGoogleMapsApi, type MapSegment } from "@/components/maps/google-map";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps-url";
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
  source: "landmark" | "trip" | "search";
};

type PlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPredictions, setSearchPredictions] = useState<PlacePrediction[]>([]);
  const [searchPlaces, setSearchPlaces] = useState<ExplorePlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string>(LANDMARK_PLACES[0].id);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapsRef = useRef<any>(null);
  const autoCompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const predictionsCacheRef = useRef<Map<string, PlacePrediction[]>>(new Map());
  const hasActiveSearchResult = searchPlaces.length > 0;

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

  useEffect(() => {
    let cancelled = false;

    async function initPlacesApi() {
      try {
        const maps = await ensureGoogleMapsApi();
        if (cancelled) {
          return;
        }
        mapsRef.current = maps;
        autoCompleteServiceRef.current = new maps.places.AutocompleteService();
        placesServiceRef.current = new maps.places.PlacesService(document.createElement("div"));
        sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
      } catch {
        if (!cancelled) {
          setSearchError("地標搜尋暫時無法使用，請稍後再試。");
        }
      }
    }

    void initPlacesApi();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    const query = searchQuery.trim();
    if (hasActiveSearchResult) {
      setIsSearching(false);
      setSearchPredictions([]);
      return;
    }
    if (query.length < 2) {
      setIsSearching(false);
      setSearchPredictions([]);
      setSearchError("");
      return;
    }

    if (!autoCompleteServiceRef.current || !mapsRef.current) {
      setSearchError("地圖搜尋服務載入中...");
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = predictionsCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchPredictions(cached);
      setSearchError("");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    searchDebounceRef.current = setTimeout(() => {
      const maps = mapsRef.current;
      autoCompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          sessionToken: sessionTokenRef.current,
          language: "zh-TW",
          region: "tw",
          componentRestrictions: { country: "tw" },
          locationBias: new maps.Circle({ center: TAIPEI_CENTER, radius: 35000 }).getBounds(),
        },
        (predictions: any[] | null, status: string) => {
          setIsSearching(false);
          if (status !== maps.places.PlacesServiceStatus.OK || !predictions || predictions.length === 0) {
            setSearchPredictions([]);
            if (status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              setSearchError("目前無法取得搜尋結果，請稍後再試。");
            }
            return;
          }

          const mapped = predictions.slice(0, 8).map((prediction) => ({
            placeId: prediction.place_id,
            mainText: prediction.structured_formatting?.main_text || prediction.description,
            secondaryText: prediction.structured_formatting?.secondary_text || "",
            fullText: prediction.description,
          }));
          predictionsCacheRef.current.set(cacheKey, mapped);
          setSearchPredictions(mapped);
        }
      );
    }, 260);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [hasActiveSearchResult, searchQuery]);

  const handleSelectPrediction = (prediction: PlacePrediction) => {
    const maps = mapsRef.current;
    if (!placesServiceRef.current || !maps) {
      return;
    }

    setIsSearching(true);
    setSearchError("");
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.placeId,
        fields: ["place_id", "name", "formatted_address", "geometry"],
        sessionToken: sessionTokenRef.current,
      },
      (place: any, status: string) => {
        setIsSearching(false);
        if (status !== maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          setSearchError("無法讀取該地標詳情，請換一個試試。");
          return;
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const selected: ExplorePlace = {
          id: `search-${place.place_id}`,
          name: place.name || prediction.mainText,
          address: place.formatted_address || prediction.secondaryText || "地標搜尋結果",
          info: "🔎 搜尋結果",
          emoji: "📌",
          color: "#ff6b6b",
          position: { lat, lng },
          source: "search",
        };

        setSearchPlaces([selected]);
        setSelectedPinId(selected.id);
        setSearchPredictions([]);
        setSearchQuery(`${selected.name}${selected.address ? ` · ${selected.address}` : ""}`);
        sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
      }
    );
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchPredictions([]);
    setSearchPlaces([]);
    setSearchError("");
  };

  const handleSearchInputChange = (value: string) => {
    if (searchPlaces.length > 0) {
      setSearchPlaces([]);
    }
    setSearchQuery(value);
  };

  const allPlaces = useMemo(() => [...LANDMARK_PLACES, ...tripPlaces, ...searchPlaces], [tripPlaces, searchPlaces]);

  const visiblePlaces = useMemo(() => {
    if (hasActiveSearchResult) {
      return searchPlaces;
    }
    if (activeFilter === "知名景點") {
      return allPlaces.filter((place) => place.source === "landmark");
    }
    if (activeFilter === "當前行程") {
      return allPlaces.filter((place) => place.source === "trip");
    }
    return allPlaces;
  }, [activeFilter, allPlaces, hasActiveSearchResult, searchPlaces]);

  const selectedPlace = useMemo(
    () => allPlaces.find((place) => place.id === selectedPinId) ?? visiblePlaces[0] ?? null,
    [allPlaces, selectedPinId, visiblePlaces]
  );

  const markers = useMemo(
    () =>
      visiblePlaces.map((place) => ({
        id: place.id,
        title: place.name,
        label: place.source === "trip" ? String(tripPlaces.findIndex((p) => p.id === place.id) + 1) : undefined,
        color: place.id === selectedPlace?.id ? "#ff6b6b" : place.color,
        position: place.position,
      })),
    [selectedPlace?.id, tripPlaces, visiblePlaces]
  );

  const tripRouteSegments = useMemo<MapSegment[]>(() => {
    if (hasActiveSearchResult || activeFilter !== "當前行程" || tripPlaces.length < 2) {
      return [];
    }
    return tripPlaces.slice(0, -1).flatMap((place, index) => {
      const next = tripPlaces[index + 1];
      if (!next) {
        return [];
      }
      return [{
        from: place.position,
        to: next.position,
        travelMode: "TRANSIT",
        color: "#3abdff",
        weight: 5,
        opacity: 0.9,
      }];
    });
  }, [activeFilter, hasActiveSearchResult, tripPlaces]);

  const tripMapsUrl = useMemo(() => {
    if (hasActiveSearchResult || activeFilter !== "當前行程") {
      return "";
    }
    return buildGoogleMapsDirectionsUrl(
      tripPlaces.map((place) => ({ name: place.name, location: place.position })),
      "TRANSIT"
    );
  }, [activeFilter, hasActiveSearchResult, tripPlaces]);

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: "#dbe9d8" }}>
      <GoogleMap
        className="absolute inset-0"
        center={TAIPEI_CENTER}
        zoom={12}
        markers={markers}
        segments={tripRouteSegments}
        onMarkerClick={setSelectedPinId}
      />

      {tripMapsUrl ? (
        <a
          href={tripMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute z-10 right-4 md:right-10 top-[108px] md:top-6 h-[36px] px-4 rounded-[18px] text-[12px] font-semibold text-white inline-flex items-center"
          style={{ background: "#3abdff", boxShadow: "0px 2px 8px rgba(0,0,0,0.18)" }}
        >
          在 Google Maps 開啟行程 ↗
        </a>
      ) : null}

      {/* ── Search bar + filters ── */}

      {/* Desktop */}
      <div className="hidden md:flex absolute top-6 left-10 items-center gap-3">
        <div className="relative">
          <div className="bg-white h-[52px] w-[480px] rounded-[16px] flex items-center px-4 gap-2" style={{ boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.12)" }}>
            <span className="text-[16px]">🔍</span>
            <input
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="搜尋地點、景點、餐廳..."
              className="flex-1 text-[15px] text-[#222] outline-none bg-transparent"
            />
            {(searchQuery || hasActiveSearchResult) ? (
              <button
                onClick={clearSearch}
                className="text-[16px] leading-none"
                style={{ color: "#999" }}
                aria-label="清除搜尋"
              >
                ×
              </button>
            ) : null}
          </div>
          {(searchPredictions.length > 0 || isSearching || searchError) ? (
            <div
              className="absolute top-[58px] left-0 w-[480px] bg-white rounded-[14px] py-2 overflow-hidden"
              style={{ boxShadow: "0px 6px 18px rgba(0,0,0,0.14)" }}
            >
              {isSearching ? <p className="px-4 py-2 text-[13px] text-[#777]">搜尋中...</p> : null}
              {!isSearching && searchError ? <p className="px-4 py-2 text-[13px] text-[#d9534f]">{searchError}</p> : null}
              {!isSearching && !searchError && searchPredictions.length === 0 && searchQuery.trim().length >= 2 ? (
                <p className="px-4 py-2 text-[13px] text-[#777]">找不到符合的地標</p>
              ) : null}
              {!isSearching && !searchError
                ? searchPredictions.map((item) => (
                  <button
                    key={item.placeId}
                    onClick={() => handleSelectPrediction(item)}
                    className="w-full px-4 py-2 text-left hover:bg-[#f5fbff]"
                  >
                    <p className="text-[13px] font-semibold text-[#222]">{item.mainText}</p>
                    <p className="text-[11px] text-[#777] mt-0.5">{item.secondaryText || item.fullText}</p>
                  </button>
                ))
                : null}
            </div>
          ) : null}
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
        <div className="relative">
          <div className="bg-white h-[48px] rounded-[14px] flex items-center px-4 gap-2" style={{ boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.12)" }}>
            <span className="text-[15px]">🔍</span>
            <input
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="搜尋地點、景點、餐廳..."
              className="flex-1 text-[14px] text-[#222] outline-none bg-transparent"
            />
            {(searchQuery || hasActiveSearchResult) ? (
              <button
                onClick={clearSearch}
                className="text-[16px] leading-none"
                style={{ color: "#999" }}
                aria-label="清除搜尋"
              >
                ×
              </button>
            ) : null}
          </div>
          {(searchPredictions.length > 0 || isSearching || searchError) ? (
            <div
              className="absolute top-[54px] left-0 right-0 bg-white rounded-[14px] py-2 overflow-hidden"
              style={{ boxShadow: "0px 6px 18px rgba(0,0,0,0.14)" }}
            >
              {isSearching ? <p className="px-4 py-2 text-[13px] text-[#777]">搜尋中...</p> : null}
              {!isSearching && searchError ? <p className="px-4 py-2 text-[13px] text-[#d9534f]">{searchError}</p> : null}
              {!isSearching && !searchError && searchPredictions.length === 0 && searchQuery.trim().length >= 2 ? (
                <p className="px-4 py-2 text-[13px] text-[#777]">找不到符合的地標</p>
              ) : null}
              {!isSearching && !searchError
                ? searchPredictions.map((item) => (
                  <button
                    key={item.placeId}
                    onClick={() => handleSelectPrediction(item)}
                    className="w-full px-4 py-2 text-left active:bg-[#f5fbff]"
                  >
                    <p className="text-[13px] font-semibold text-[#222]">{item.mainText}</p>
                    <p className="text-[11px] text-[#777] mt-0.5">{item.secondaryText || item.fullText}</p>
                  </button>
                ))
                : null}
            </div>
          ) : null}
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
