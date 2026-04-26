"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "@/services/api/client";
import { agentService, tripsService, usersService } from "@/services/api/services";
import type {
  EnrichResponse,
  EnrichedRoute,
  PlannedRoute,
  Trip,
  UserProfile,
} from "@/services/api/types";
import { getSession } from "@/services/auth/session";
import { getCurrentTripId, setCurrentTripId } from "@/services/trips/currentTrip";

const STYLE_TAGS = [
  { label: "🍜 美食探索", active: true },
  { label: "🏛 文化歷史", active: true },
  { label: "📸 網美打卡", active: true },
  { label: "🌿 親近自然", active: false },
  { label: "🛍 購物逛街", active: false },
  { label: "🎭 藝文展演", active: false },
  { label: "🌙 夜生活", active: false },
];

type RecCardItem = {
  emoji: string;
  title: string;
  desc: string;
  duration: string;
  tags: string[];
  tripId?: string;
};

type PlanningSnapshot = {
  prompt: string;
  selectedTags: string[];
  relatedPreferenceTags: string[];
  preferenceSignals: string[];
};

const FALLBACK_REC_CARDS: RecCardItem[] = [
  { emoji: "🏮", title: "大稻埕文化之旅", desc: "迪化街 · 霞海城隍廟 · 永樂市場", duration: "半天", tags: ["文化", "美食"], tripId: "demo-datong" },
  { emoji: "🌿", title: "陽明山一日遊", desc: "冷水坑 · 擎天崗 · 花鐘", duration: "一天", tags: ["自然", "健行"], tripId: "demo-yangming" },
  { emoji: "🌃", title: "信義區夜生活", desc: "101 · 微風廣場 · 象山", duration: "傍晚", tags: ["打卡", "夜景"], tripId: "demo-xinyi" },
  { emoji: "🍵", title: "貓空茶山漫步", desc: "貓空纜車 · 老茶館 · 山景", duration: "半天", tags: ["自然", "放鬆"], tripId: "demo-maokong" },
];

const CONIC_BG = "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

const ACTIVE_TRIP_STATUSES = new Set(["active", "planned", "disrupted", "replanning"]);

function toCompactList(values: string[], maxItems: number): string {
  const sanitized = values.map((value) => value.trim()).filter(Boolean);
  if (sanitized.length === 0) {
    return "";
  }
  if (sanitized.length <= maxItems) {
    return sanitized.join("、");
  }
  return `${sanitized.slice(0, maxItems).join("、")} 等 ${sanitized.length} 項`;
}

function collectPreferenceTags(profile: UserProfile | null): string[] {
  if (!profile) {
    return [];
  }

  const rawTags = profile.combined_tags && profile.combined_tags.length > 0
    ? profile.combined_tags
    : profile.selected_tags;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of rawTags) {
    const normalized = tag.trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function extractPromptTerms(text: string): string[] {
  const matches = text.toLowerCase().match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) ?? [];
  const expanded: string[] = [];

  for (const chunk of matches) {
    expanded.push(chunk);
    if (/^[\u4e00-\u9fff]+$/.test(chunk) && chunk.length >= 3) {
      for (let i = 0; i <= chunk.length - 2; i += 1) {
        expanded.push(chunk.slice(i, i + 2));
      }
    }
  }

  return Array.from(new Set(expanded.filter((term) => term.length >= 2)));
}

function scorePreferenceTag(tag: string, promptTerms: string[], selectedTags: string[]): number {
  const normalizedTag = tag.toLowerCase();
  let score = 0;

  for (const selectedTag of selectedTags) {
    const normalizedSelected = selectedTag.toLowerCase();
    if (!normalizedSelected) {
      continue;
    }
    if (normalizedTag.includes(normalizedSelected) || normalizedSelected.includes(normalizedTag)) {
      score += 4;
    }
  }

  for (const term of promptTerms) {
    if (normalizedTag.includes(term) || term.includes(normalizedTag)) {
      score += 3;
    }
  }

  return score;
}

function buildRelatedPreferenceTags(
  profile: UserProfile | null,
  prompt: string,
  selectedTags: string[],
  limit = 4,
): string[] {
  const candidates = collectPreferenceTags(profile);
  if (candidates.length === 0) {
    return [];
  }

  const promptTerms = extractPromptTerms(`${prompt} ${selectedTags.join(" ")}`);
  const scored = candidates.map((tag, index) => ({
    tag,
    index,
    score: scorePreferenceTag(tag, promptTerms, selectedTags),
  }));

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const relevant = scored.filter((item) => item.score > 0).map((item) => item.tag);
  const remaining = scored.filter((item) => item.score <= 0).map((item) => item.tag);

  return [...relevant, ...remaining].slice(0, limit);
}

function buildPreferenceSignals(profile: UserProfile | null): string[] {
  if (!profile) {
    return [];
  }

  const signals: string[] = [];

  const transportationSummary = toCompactList(profile.preferred_transportation, 3);
  if (transportationSummary) {
    signals.push(`交通偏好：${transportationSummary}`);
  }

  const languageSummary = toCompactList(profile.preferred_languages, 2);
  if (languageSummary) {
    signals.push(`語言偏好：${languageSummary}`);
  }

  if (profile.country.trim()) {
    signals.push(`所在國家：${profile.country.trim()}`);
  }

  return signals;
}

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

function countEnrichedPlaces(enrich: EnrichResponse): number {
  return Object.values(enrich.routes).reduce((sum, route) => sum + route.places.length, 0);
}

function tripToRecCard(trip: Trip): RecCardItem {
  return {
    emoji: "🧭",
    title: trip.route_name || `行程 ${trip.trip_id}`,
    desc: `${trip.theme || "城市探索"} · ${trip.stops.length} 個景點`,
    duration: toDurationLabel(trip.stops.length),
    tags: [trip.theme || "旅遊", trip.status],
    tripId: trip.trip_id,
  };
}

function tripToPlannedRoute(trip: Trip): PlannedRoute {
  const stops = [...(trip.stops || [])].sort((a, b) => a.step_order - b.step_order);

  return {
    route_id: trip.original_route_id || `trip-${trip.trip_id}`,
    route_name: trip.route_name || `行程 ${trip.trip_id}`,
    theme: trip.theme || "城市探索",
    google_maps_url: trip.google_maps_url || "",
    tsp_evaluation: trip.tsp_evaluation ?? {
      total_transit_time_mins: 0,
      smoothness_score: 0,
    },
    waypoints: stops.map((stop) => ({
      step_order: stop.step_order,
      name: stop.name,
      place_id: stop.place_id,
      location: stop.location,
      suggested_time: stop.suggested_time,
      reasoning: stop.reasoning,
    })),
  };
}

const STATUS_MESSAGES = ["搜尋最佳景點...", "規劃路線中...", "整理行程資訊...", "即將完成..."];

export default function TripsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState(STYLE_TAGS);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [planningSnapshot, setPlanningSnapshot] = useState<PlanningSnapshot | null>(null);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [enrichByTripId, setEnrichByTripId] = useState<Record<string, EnrichResponse>>({});
  const [enrichingTripId, setEnrichingTripId] = useState("");
  const [enrichErrorMessage, setEnrichErrorMessage] = useState("");

  const session = useMemo(() => getSession(), []);

  const selectedTagNames = useMemo(
    () => tags.filter((tag) => tag.active).map((tag) => cleanTagLabel(tag.label)),
    [tags]
  );

  const ongoingTrip = useMemo(
    () => trips.find((trip) => ACTIVE_TRIP_STATUSES.has(trip.status)),
    [trips]
  );

  const selectedTrip = useMemo(() => {
    if (trips.length === 0) {
      return undefined;
    }
    if (!selectedTripId) {
      return ongoingTrip || trips[0];
    }
    return trips.find((trip) => trip.trip_id === selectedTripId) || ongoingTrip || trips[0];
  }, [trips, selectedTripId, ongoingTrip]);

  const recCards = useMemo(
    () => (trips.length > 0 ? trips.slice(0, 4).map(tripToRecCard) : FALLBACK_REC_CARDS),
    [trips]
  );

  const selectedEnrichedRoute = useMemo<EnrichedRoute | null>(() => {
    if (!selectedTrip) {
      return null;
    }

    const enrich = enrichByTripId[selectedTrip.trip_id];
    if (!enrich) {
      return null;
    }

    const preferredRouteId = selectedTrip.original_route_id || `trip-${selectedTrip.trip_id}`;
    if (enrich.routes[preferredRouteId]) {
      return enrich.routes[preferredRouteId];
    }

    return Object.values(enrich.routes)[0] ?? null;
  }, [selectedTrip, enrichByTripId]);

  const toggleTag = (i: number) =>
    setTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, active: !t.active } : t)));

  const openTripDetail = (tripId: string) => {
    if (session?.userId) {
      setCurrentTripId(session.userId, tripId);
    }
    setSelectedTripId(tripId);
    router.push(`/trips/${tripId}`);
  };

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

  async function enrichTrip(trip: Trip, routeOverride?: PlannedRoute): Promise<EnrichResponse | null> {
    if (enrichingTripId === trip.trip_id) {
      return null;
    }

    setEnrichErrorMessage("");
    setEnrichingTripId(trip.trip_id);

    try {
      const enrich = await agentService.enrich([routeOverride ?? tripToPlannedRoute(trip)]);
      setEnrichByTripId((prev) => ({
        ...prev,
        [trip.trip_id]: enrich,
      }));
      return enrich;
    } catch (error) {
      if (error instanceof ApiError) {
        setEnrichErrorMessage(error.message);
      } else {
        setEnrichErrorMessage("補充景點資訊失敗，請稍後再試。");
      }
      return null;
    } finally {
      setEnrichingTripId("");
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

    const relatedPreferenceTags = buildRelatedPreferenceTags(userProfile, query, selectedTagNames);
    const preferenceSignals = buildPreferenceSignals(userProfile);

    setPlanningSnapshot({
      prompt: query,
      selectedTags: [...selectedTagNames],
      relatedPreferenceTags,
      preferenceSignals,
    });

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

      setCurrentTripId(session.userId, trip.trip_id);
      router.push(`/trips/${trip.trip_id}`);
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

  async function handleSelectTrip(tripId: string) {
    setSelectedTripId(tripId);
    const trip = trips.find((item) => item.trip_id === tripId);
    if (!trip) {
      return;
    }

    if (!enrichByTripId[tripId]) {
      await enrichTrip(trip);
    }
  }

  useEffect(() => {
    if (!planning) { setStatusIdx(0); return; }
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 1800);
    return () => clearInterval(id);
  }, [planning]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserProfile() {
      if (!session?.userId) {
        setUserProfile(null);
        return;
      }

      try {
        const profile = await usersService.get(session.userId);
        if (!cancelled) {
          setUserProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setUserProfile(null);
        }
      }
    }

    void loadUserProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  useEffect(() => {
    if (!session?.userId) {
      return;
    }

    if (searchParams.get("mode") === "plan") {
      return;
    }

    const currentTripId = getCurrentTripId(session.userId);
    if (!currentTripId) {
      return;
    }

    router.replace(`/trips/${currentTripId}`);
  }, [router, searchParams, session?.userId]);

  useEffect(() => {
    void refreshTrips();
  }, [session?.userId]);

  useEffect(() => {
    if (trips.length === 0) {
      setSelectedTripId(null);
      return;
    }

    if (!selectedTripId || !trips.some((trip) => trip.trip_id === selectedTripId)) {
      setSelectedTripId(trips[0].trip_id);
    }
  }, [trips, selectedTripId]);

  return (
    <div className="min-h-screen" style={{ background: CONIC_BG }}>
      <style>{`
        @keyframes bearBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes dotPulse { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1.1)} }
      `}</style>

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

          {planning ? (
            <PlanningStatusCard
              statusMessage={STATUS_MESSAGES[statusIdx]}
              planningSnapshot={planningSnapshot}
            />
          ) : errorMessage ? (
            <p className="text-[13px]" style={{ color: "#d9534f" }}>{errorMessage}</p>
          ) : successMessage ? (
            <p className="text-[13px]" style={{ color: "#2ebf59" }}>{successMessage}</p>
          ) : null}

          <p className="text-[14px] text-center mt-auto pt-4" style={{ color: "#999" }}>© 2026 Taibear</p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch my-12" style={{ background: "#e0e0e0" }} />

        {/* Right column */}
        <div className="w-[452px] px-8 py-12 flex flex-col gap-5 flex-shrink-0">
          <OngoingTripCard
            trip={ongoingTrip}
            loading={loadingTrips}
            onRefresh={refreshTrips}
            onOpen={ongoingTrip ? () => openTripDetail(ongoingTrip.trip_id) : undefined}
            selected={Boolean(ongoingTrip && selectedTripId === ongoingTrip.trip_id)}
          />
          <p className="text-[16px] font-semibold text-black">✦ 精選推薦行程</p>
          <div className="grid grid-cols-2 gap-4">
            {recCards.map((card) => (
              <RecCard
                key={`${card.title}-${card.desc}`}
                {...card}
                selected={Boolean(card.tripId && selectedTripId === card.tripId)}
                onClick={card.tripId ? () => openTripDetail(card.tripId!) : undefined}
              />
            ))}
          </div>

          <TripDetailPanel
            trip={selectedTrip}
            enrichedRoute={selectedEnrichedRoute}
            loadingEnrich={Boolean(selectedTrip && enrichingTripId === selectedTrip.trip_id)}
            enrichErrorMessage={enrichErrorMessage}
            onRequestEnrich={selectedTrip ? () => void enrichTrip(selectedTrip) : undefined}
          />
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

        {planning ? (
          <PlanningStatusCard
            statusMessage={STATUS_MESSAGES[statusIdx]}
            planningSnapshot={planningSnapshot}
          />
        ) : errorMessage ? (
          <p className="text-[13px]" style={{ color: "#d9534f" }}>{errorMessage}</p>
        ) : successMessage ? (
          <p className="text-[13px]" style={{ color: "#2ebf59" }}>{successMessage}</p>
        ) : null}

        <OngoingTripCard
          trip={ongoingTrip}
          loading={loadingTrips}
          onRefresh={refreshTrips}
          onOpen={ongoingTrip ? () => openTripDetail(ongoingTrip.trip_id) : undefined}
          selected={Boolean(ongoingTrip && selectedTripId === ongoingTrip.trip_id)}
        />

        <p className="text-[16px] font-semibold text-black">✦ 精選推薦行程</p>
        <div className="flex flex-col gap-4">
          {recCards.map((card) => (
            <RecCard
              key={`${card.title}-${card.desc}`}
              {...card}
              selected={Boolean(card.tripId && selectedTripId === card.tripId)}
              onClick={card.tripId ? () => openTripDetail(card.tripId!) : undefined}
            />
          ))}
        </div>

        <TripDetailPanel
          trip={selectedTrip}
          enrichedRoute={selectedEnrichedRoute}
          loadingEnrich={Boolean(selectedTrip && enrichingTripId === selectedTrip.trip_id)}
          enrichErrorMessage={enrichErrorMessage}
          onRequestEnrich={selectedTrip ? () => void enrichTrip(selectedTrip) : undefined}
        />

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

function PlanningStatusCard({
  statusMessage,
  planningSnapshot,
}: {
  statusMessage: string;
  planningSnapshot: PlanningSnapshot | null;
}) {
  const promptText = planningSnapshot?.prompt || "未提供";
  const selectedTagsText = planningSnapshot && planningSnapshot.selectedTags.length > 0
    ? planningSnapshot.selectedTags.join("、")
    : "未額外選擇前端標籤";
  const relatedPreferenceTagsText = planningSnapshot && planningSnapshot.relatedPreferenceTags.length > 0
    ? planningSnapshot.relatedPreferenceTags.join("、")
    : "我們會參考你在問卷中留下的個人偏好標籤";
  const preferenceSignalsText = planningSnapshot && planningSnapshot.preferenceSignals.length > 0
    ? planningSnapshot.preferenceSignals.join(" ｜ ")
    : "";

  return (
    <div
      className="flex items-start gap-3 rounded-[16px] px-4 py-3"
      style={{
        background: "white",
        boxShadow: "0px 4px 16px rgba(58,189,255,0.14)",
        border: "1.5px solid rgba(58,189,255,0.18)",
      }}
    >
      <span style={{ fontSize: 26, animation: "bearBounce 0.9s ease infinite", display: "inline-block" }}>🐻</span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#141414]">{statusMessage}</p>
        <p className="text-[12px]" style={{ color: "#999" }}>Taibear 正在規劃中，已參考以下資料：</p>
        <div className="mt-1.5">
          <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
            提示詞：{promptText}
          </p>
          <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
            已選標籤：{selectedTagsText}
          </p>
          <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
            根據我們對你的了解，這次會優先考慮你的偏好標籤：{relatedPreferenceTagsText}
          </p>
          {preferenceSignalsText ? (
            <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
              另外也會參考：{preferenceSignalsText}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0 pt-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#3abdff",
              animation: `dotPulse 1.2s ease ${i * 0.22}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OngoingTripCard({
  trip,
  loading,
  onRefresh,
  onOpen,
  selected,
}: {
  trip?: Trip;
  loading: boolean;
  onRefresh: () => void;
  onOpen?: () => void;
  selected?: boolean;
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
      style={{
        background: "#fef3da",
        borderColor: selected ? "#3abdff" : "#f7d989",
        minHeight: 130,
      }}
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

      <div className="absolute bottom-4 right-4 flex gap-2">
        {onOpen ? (
          <button
            onClick={onOpen}
            className="px-4 h-[32px] rounded-[10px] text-white text-[12px] font-semibold"
            style={{ background: "#3abdff" }}
          >
            查看行程
          </button>
        ) : null}
        <button
          onClick={onRefresh}
          className="px-4 h-[32px] rounded-[10px] text-white text-[12px] font-semibold"
          style={{ background: "#ffd26a" }}
        >
          更新資料 ↻
        </button>
      </div>
    </div>
  );
}

function RecCard({
  emoji,
  title,
  desc,
  duration,
  tags,
  onClick,
  selected,
}: {
  emoji: string;
  title: string;
  desc: string;
  duration: string;
  tags: string[];
  onClick?: () => void;
  selected?: boolean;
}) {
  const clickable = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`bg-white rounded-[16px] p-4 text-left transition-shadow ${
        clickable ? "cursor-pointer hover:shadow-md" : "cursor-default"
      }`}
      style={{
        boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.06)",
        border: selected ? "1.5px solid #3abdff" : "1.5px solid transparent",
      }}
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
    </button>
  );
}

function TripDetailPanel({
  trip,
  enrichedRoute,
  loadingEnrich,
  enrichErrorMessage,
  onRequestEnrich,
}: {
  trip?: Trip;
  enrichedRoute: EnrichedRoute | null;
  loadingEnrich: boolean;
  enrichErrorMessage: string;
  onRequestEnrich?: () => void;
}) {
  if (!trip) {
    return (
      <div
        className="bg-white rounded-[16px] p-4"
        style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.06)" }}
      >
        <p className="text-[14px] font-semibold text-black">行程詳情</p>
        <p className="text-[12px] mt-2" style={{ color: "#999" }}>尚未建立可查看的行程。</p>
      </div>
    );
  }

  const orderedStops = [...(trip.stops || [])].sort((a, b) => a.step_order - b.step_order);
  const hasEnriched = Boolean(enrichedRoute && enrichedRoute.places.length > 0);

  return (
    <div
      className="bg-white rounded-[16px] p-4"
      style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-black">行程詳情</p>
        <button
          onClick={onRequestEnrich}
          disabled={!onRequestEnrich || loadingEnrich}
          className="h-[30px] px-3 rounded-[10px] text-[11px] text-white disabled:opacity-70"
          style={{ background: "#3abdff" }}
        >
          {loadingEnrich ? "補充中..." : hasEnriched ? "更新 AI 補充" : "載入 AI 補充"}
        </button>
      </div>

      <p className="mt-2 text-[14px] font-semibold text-black">{trip.route_name || `行程 ${trip.trip_id}`}</p>
      <p className="text-[12px] mt-1" style={{ color: "#777" }}>
        📅 {formatDateLabel(trip.trip_date)} · 🧭 {trip.theme || "城市探索"} · 📍 {orderedStops.length} 個景點
      </p>

      {trip.google_maps_url ? (
        <a
          href={trip.google_maps_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-[12px] font-medium"
          style={{ color: "#3abdff" }}
        >
          在 Google Maps 開啟整段路線 ↗
        </a>
      ) : null}

      <div className="mt-3">
        <p className="text-[12px] font-semibold" style={{ color: "#555" }}>路線停靠點</p>
        <div className="mt-2 flex flex-col gap-2">
          {orderedStops.map((stop) => (
            <div
              key={stop.stop_id}
              className="rounded-[10px] border px-3 py-2"
              style={{ borderColor: "#eee" }}
            >
              <p className="text-[12px] font-semibold text-[#222]">
                {stop.step_order}. {stop.name}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "#777" }}>
                {stop.suggested_time || "時間未指定"} · {stop.reasoning || "無補充說明"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {enrichErrorMessage ? (
        <p className="text-[12px] mt-3" style={{ color: "#d9534f" }}>
          {enrichErrorMessage}
        </p>
      ) : null}

      <div className="mt-4 border-t pt-3" style={{ borderColor: "#efefef" }}>
        <p className="text-[12px] font-semibold" style={{ color: "#555" }}>AI 補充資訊（/enrich）</p>

        {loadingEnrich ? (
          <p className="text-[12px] mt-2" style={{ color: "#999" }}>補充內容生成中...</p>
        ) : hasEnriched && enrichedRoute ? (
          <div className="mt-2 flex flex-col gap-2 max-h-[220px] overflow-auto pr-1">
            {enrichedRoute.places.map((place) => {
              const topReview = place.reviews.most_relevant[0] || place.reviews.newest[0];
              return (
                <div
                  key={`${place.place_id || place.place_name}-${place.folder}`}
                  className="rounded-[10px] border px-3 py-2"
                  style={{ borderColor: "#eee" }}
                >
                  <p className="text-[12px] font-semibold text-[#222]">{place.place_name}</p>
                  {place.captions.length > 0 ? (
                    <p className="text-[11px] mt-1" style={{ color: "#555" }}>
                      🎬 {place.captions.join(" / ")}
                    </p>
                  ) : null}
                  <p className="text-[11px] mt-1" style={{ color: "#777" }}>
                    🖼 {place.photos.length} 張照片 · 🗣 最新 {place.reviews.newest.length} 則評論
                  </p>
                  {topReview?.text ? (
                    <p className="text-[11px] mt-1" style={{ color: "#999" }}>
                      「{topReview.text.slice(0, 70)}{topReview.text.length > 70 ? "..." : ""}」
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] mt-2" style={{ color: "#999" }}>
            尚未載入 AI 補充資訊，可點右上按鈕取得評論摘要、照片數量與短影片字幕。
          </p>
        )}
      </div>
    </div>
  );
}
