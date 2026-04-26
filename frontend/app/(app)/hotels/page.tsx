"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/services/api/client";
import { agentService, usersService } from "@/services/api/services";
import type { HotelSearchResult, UserProfile } from "@/services/api/types";
import { getSession } from "@/services/auth/session";

// ── Data ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { num: "1", bg: "#3abdff", textColor: "white", emoji: "⬇️", title: "一鍵安裝到 Chrome", desc: "從 Chrome 線上應用程式商店免費安裝，30 秒完成" },
  { num: "2", bg: "#fec728", textColor: "#141414", emoji: "🔍", title: "前往任何訂房網站", desc: "支援 Booking.com、Agoda、Airbnb 等主流平台" },
  { num: "3", bg: "#2ebf59", textColor: "white", emoji: "🛡️", title: "即時偵測・自動把關", desc: "插件自動比對台灣合法旅館登記資料，發現異常立即警告" },
];

const EXT_STATS = [
  { value: "50,000+", label: "次插件下載" },
  { value: "99.1%", label: "非法房源識別率" },
  { value: "< 1 秒", label: "即時比對速度" },
  { value: "免費", label: "完全不收費" },
];

const STYLE_TAGS_DEFAULT = [
  { label: "捷運站旁", active: true },
  { label: "文青風格", active: true },
  { label: "CP 值高", active: true },
  { label: "奢華體驗", active: false },
  { label: "鄰近夜市", active: false },
  { label: "免費停車", active: false },
  { label: "寵物友善", active: false },
];

const LOCATION_OPTIONS = [
  "台北市中正區",
  "台北市大同區",
  "台北市中山區",
  "台北市松山區",
  "台北市大安區",
  "台北市萬華區",
  "台北市信義區",
  "台北市士林區",
  "台北市北投區",
  "台北市內湖區",
  "台北市南港區",
  "台北市文山區",
];

const HOTEL_STATS = [
  { value: "12,483", label: "位旅客受保護" },
  { value: "98.7%", label: "合法認證準確率" },
  { value: "5 秒", label: "平均審查速度" },
  { value: "免費", label: "完全不收費" },
];

const BAR_HEIGHTS = [90, 70, 82, 62, 88, 78, 66, 84];

const CONIC = "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

type RankedHotel = {
  id: string;
  displayName: string;
  address: string;
  city: string;
  source: string;
  sourceUrl: string | null;
  hotelId: string | null;
  licenseNumber: string | null;
  score: number;
  reason: string;
};

type SearchContextSnapshot = {
  prompt: string;
  location: string;
  selectedTags: string[];
  relatedPreferenceTags: string[];
  preferenceSignals: string[];
};

function toRankedHotel(hotel: HotelSearchResult, index: number): RankedHotel {
  return {
    id: hotel.hotel_id ?? `${hotel.name}-${index}`,
    displayName: hotel.name,
    address: hotel.address ?? "地址未提供",
    city: hotel.city ?? "",
    source: "taibear-search",
    sourceUrl: null,
    hotelId: hotel.hotel_id ?? null,
    licenseNumber: hotel.license_number ?? null,
    score: hotel.score,
    reason: hotel.reason,
  };
}

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

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex bg-white items-center px-20 h-[72px]" style={{ borderBottom: "1px solid #f0f0f0" }}>
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-center">
            {i > 0 && <div className="w-px h-8 mx-16 bg-gray-200" />}
            <div>
              <p className="text-[18px] font-bold text-[#141414]">{stat.value}</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#999" }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Mobile: 2×2 grid */}
      <div className="grid grid-cols-2 md:hidden bg-white py-4 px-4 gap-4" style={{ borderBottom: "1px solid #f0f0f0" }}>
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-[16px] font-bold text-[#141414]">{stat.value}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#999" }}>{stat.label}</p>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function ExtensionView({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="min-h-screen" style={{ background: "#f5f5f5" }}>
      <section
        className="relative overflow-hidden px-[72px] pt-[85px] pb-[60px] flex items-start gap-10"
        style={{ background: CONIC, minHeight: 490 }}
      >
        <div className="flex-1 pt-2">
          <h1 className="text-[76px] font-bold leading-tight text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.22), 0 6px 40px rgba(0,0,0,0.12)" }}>訂房守門員</h1>
          <h1 className="text-[76px] font-bold leading-tight" style={{ color: "#fec728", textShadow: "0 2px 18px rgba(254,199,40,0.45), 0 6px 40px rgba(0,0,0,0.14)" }}>自己找，我幫你把關。</h1>
          <p className="mt-6 text-[17px] max-w-[540px]" style={{ color: "#8c8c8c" }}>瀏覽訂房網站時，Taibear 插件即時比對合法資料庫，提前揪出非法業者。</p>
          <div className="flex gap-4 mt-8">
            <button onClick={onSwitch} className="h-[52px] px-8 rounded-[13px] text-[15px] transition-colors hover:bg-black/5" style={{ border: "1.5px solid #616161", color: "#a6a6a6" }}>找合法住宿 →</button>
            <button className="h-[52px] px-8 rounded-[13px] text-[#141414] text-[16px] font-semibold" style={{ background: "#fec728" }}>立即安裝插件</button>
          </div>
        </div>
        <BrowserMockup />
      </section>

      <StatsBar stats={EXT_STATS} />

      <section className="px-[72px] py-10" style={{ background: "#f5f5f5" }}>
        <h2 className="text-[22px] font-bold text-[#141414]">三步驟，全程保護你的訂房安全</h2>
        <p className="text-[15px] mt-1 mb-8" style={{ color: "#999" }}>安裝後自動運作，不影響你的訂房習慣</p>
        <div className="grid grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div key={step.num} className="bg-white rounded-[20px] p-5 relative" style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.04)", minHeight: 170 }}>
              <div className="flex items-start justify-between mb-6">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] font-bold flex-shrink-0" style={{ background: step.bg, color: step.textColor }}>{step.num}</div>
                <span className="text-[28px]">{step.emoji}</span>
              </div>
              <p className="text-[16px] font-semibold text-[#141414] mb-2">{step.title}</p>
              <p className="text-[13px] leading-[22px]" style={{ color: "#999" }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HotelsView({ onSwitch, showExtensionBtn = true }: { onSwitch: () => void; showExtensionBtn?: boolean }) {
  const [tags, setTags] = useState(STYLE_TAGS_DEFAULT);
  const [prompt, setPrompt] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<RankedHotel[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchHint, setSearchHint] = useState("請輸入需求與地點，點擊按鈕後系統會搜尋最佳旅宿。");
  const [checkedCount, setCheckedCount] = useState(0);
  const [savingHotelId, setSavingHotelId] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [searchSnapshot, setSearchSnapshot] = useState<SearchContextSnapshot | null>(null);

  const searchSeqRef = useRef(0);
  const session = useMemo(() => getSession(), []);

  const toggleTag = (i: number) =>
    setTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, active: !t.active } : t)));

  const activeTagLabels = useMemo(
    () => tags.filter((tag) => tag.active).map((tag) => tag.label),
    [tags]
  );

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

  async function runHotelSearch() {
    const query = prompt.trim();
    const selectedLocation = location.trim();
    const effectiveQuery = query || activeTagLabels.join(" ");
    const currentSeq = ++searchSeqRef.current;

    const relatedPreferenceTags = buildRelatedPreferenceTags(userProfile, effectiveQuery, activeTagLabels);
    const preferenceSignals = buildPreferenceSignals(userProfile);

    setSearchSnapshot({
      prompt: effectiveQuery,
      location: selectedLocation,
      selectedTags: [...activeTagLabels],
      relatedPreferenceTags,
      preferenceSignals,
    });

    setSearching(true);
    setSearchError("");

    try {
      const response = await agentService.searchHotels({
        query: effectiveQuery,
        location: selectedLocation,
        tags: activeTagLabels,
        top_k: 8,
      });

      const ranked = response.ranked_hotels.map((hotel, index) => toRankedHotel(hotel, index));

      if (currentSeq !== searchSeqRef.current) {
        return;
      }

      setCheckedCount(response.total_candidates);
      setResults(ranked);

      if (ranked.length === 0) {
        setSearchHint("找不到符合條件的合法旅宿，請調整地點、提示內容或偏好標籤。");
      } else if (response.warning) {
        setSearchHint(response.warning);
      } else {
        setSearchHint(response.used_llm ? "已完成 LLM 旅宿排序。" : "已完成規則式旅宿排序。");
      }
    } catch (error) {
      if (currentSeq !== searchSeqRef.current) {
        return;
      }

      if (error instanceof ApiError) {
        setSearchError(error.message);
      } else {
        setSearchError("旅宿搜尋失敗，請稍後再試。");
      }
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  }

  async function handleSaveHotel(hotel: RankedHotel) {
    setSavingHotelId(hotel.id);
    setSearchError("");

    try {
      await agentService.saveHotel({
        display_name: hotel.displayName,
        address: hotel.address,
        license_number: hotel.licenseNumber ?? undefined,
        source: hotel.source,
        source_url: hotel.sourceUrl ?? `search:${hotel.hotelId ?? hotel.displayName}`,
        hotel_id: hotel.hotelId ?? undefined,
      });
      setSearchHint(`已加入收藏：${hotel.displayName}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setSearchError(error.message);
      } else {
        setSearchError("收藏失敗，請稍後再試。");
      }
    } finally {
      setSavingHotelId("");
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#f5f5f5" }}>
      {/* Hero */}
      <section
        className="relative overflow-hidden px-4 md:px-[72px] pt-[40px] md:pt-[85px] pb-[40px] md:pb-[60px] flex items-start gap-10"
        style={{ background: CONIC, minHeight: 320 }}
      >
        <div className="flex-1">
          <h1 className="text-[42px] md:text-[76px] font-bold leading-tight text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.22), 0 6px 40px rgba(0,0,0,0.12)" }}>安心住宿</h1>
          <h1 className="text-[42px] md:text-[76px] font-bold leading-tight" style={{ color: "#ffd26a", textShadow: "0 2px 18px rgba(255,210,106,0.45), 0 6px 40px rgba(0,0,0,0.14)" }}>從這裡開始。</h1>
          <p className="mt-4 text-[15px] md:text-[17px] max-w-[540px]" style={{ color: "#8c8c8c" }}>Taibear 會呼叫後端 /api/search-hotels，使用 LLM 搜尋並排序最符合你的旅宿。</p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => void runHotelSearch()}
              className="h-[44px] md:h-[52px] px-6 md:px-8 rounded-[13px] text-white text-[15px] md:text-[16px] font-semibold"
              style={{ background: "#3abdff" }}
            >
              {searching ? "搜尋中..." : "找合法住宿"}
            </button>
            {showExtensionBtn && (
              <button onClick={onSwitch} className="h-[44px] md:h-[52px] px-6 md:px-8 rounded-[13px] text-white text-[14px] md:text-[15px] font-extrabold border-2 border-white transition-colors hover:bg-white/10">
                安裝守門員插件 →
              </button>
            )}
          </div>
        </div>

        {/* Right card: desktop only */}
        <div className="hidden md:block w-[360px] rounded-[24px] overflow-hidden flex-shrink-0 mt-4" style={{ background: "#d0efff" }}>
          <div className="relative h-[170px] mx-6 mt-6 rounded-[12px] overflow-hidden flex items-end px-4 gap-3" style={{ background: "linear-gradient(to top, #1a73e5, #99d9ff)" }}>
            {BAR_HEIGHTS.map((h, i) => (<div key={i} className="flex-1 rounded-t-[2px]" style={{ height: h, background: "#0f1a33" }} />))}
            <div className="absolute top-4 right-4 h-[32px] px-3 rounded-[10px] flex items-center text-[13px] font-semibold border" style={{ background: "rgba(58,189,255,0.12)", borderColor: "rgba(58,189,255,0.4)", color: "#3abdff" }}>✓ 合法認證房源</div>
          </div>
          <div className="px-6 py-5">
            <p className="text-[16px] font-semibold text-white">自動依提示搜尋</p>
            <p className="text-[12px] mt-1" style={{ color: "#737373" }}>輸入需求後即時觸發後端合法比對</p>
            <button
              onClick={() => void runHotelSearch()}
              className="mt-3 h-[36px] w-[120px] rounded-[10px] text-white text-[13px] font-semibold"
              style={{ background: "#3abdff" }}
            >
              立即搜尋
            </button>
          </div>
        </div>
      </section>

      <StatsBar stats={HOTEL_STATS} />

      {/* Preferences */}
      <section className="px-4 md:px-20 py-8 md:py-10" style={{ background: "#f5f5f5" }}>
        <h2 className="text-[20px] md:text-[22px] font-bold text-[#141414]">選擇你的喜好</h2>
        <p className="text-[14px] md:text-[15px] mt-1" style={{ color: "#999" }}>Taibear 根據你的偏好與地點，從後端候選旅宿中挑選最佳合法結果</p>

        <p className="text-[14px] font-semibold mt-4 mb-2" style={{ color: "#999" }}>✦ 住宿地點</p>
        <input
          list="location-options"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full h-[46px] rounded-[12px] border px-4 text-[14px] outline-none bg-white"
          style={{ borderColor: "#d9e6ef", color: "#1a1a1a" }}
          placeholder="例如：台北市信義區、北投區、新北板橋"
        />
        <datalist id="location-options">
          {LOCATION_OPTIONS.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>

        <p className="text-[14px] font-semibold mt-4 mb-3" style={{ color: "#999" }}>✦ 你的住宿風格</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {tags.map((tag, i) => (
            <button
              key={tag.label}
              onClick={() => toggleTag(i)}
              className="h-[36px] px-4 rounded-[20px] text-[13px] font-semibold border-[1.5px] transition-colors"
              style={tag.active ? { background: "#d0efff", borderColor: "#3abdff", color: "#3abdff" } : { background: "white", borderColor: "#e0e0e0", color: "#1a1a1a", fontWeight: 400 }}
            >
              {tag.label}
            </button>
          ))}
        </div>

        <div className="relative rounded-[20px] border-2 bg-white" style={{ borderColor: "#3abdff", minHeight: 140 }}>
          <textarea
            className="w-full h-[100px] md:h-[120px] pt-[18px] px-[18px] text-[15px] resize-none outline-none bg-transparent"
            style={{ color: "#1a1a1a" }}
            placeholder={"輸入你的住宿需求，系統會自動搜尋最佳合法旅宿...\n\n例如：靠近捷運、安靜、適合家庭入住"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            onClick={() => void runHotelSearch()}
            className="absolute bottom-3 right-3 w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-white text-[18px]"
            style={{ background: "#3abdff" }}
          >
            ↑
          </button>
        </div>

        <button
          onClick={() => void runHotelSearch()}
          className="w-full h-[56px] rounded-[16px] text-white text-[17px] font-semibold mt-4"
          style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}
        >
          {searching ? "正在自動搜尋合法旅宿..." : "✦ 自動搜尋最佳合法旅宿"}
        </button>

        {searching ? (
          <HotelSearchStatusCard searchSnapshot={searchSnapshot} />
        ) : null}

        {searchError ? (
          <p className="text-[13px] mt-3" style={{ color: "#d9534f" }}>{searchError}</p>
        ) : null}
        {searchHint ? (
          <p className="text-[12px] mt-3 whitespace-pre-line" style={{ color: "#999" }}>{searchHint}</p>
        ) : null}
      </section>

      {/* Hotel list */}
      <section className="bg-white px-4 md:px-[72px] py-8 md:py-12">
        <h2 className="text-[18px] md:text-[20px] font-semibold text-[#141414]">✦ 為你找到 {results.length} 間合法住宿</h2>
        <p className="text-[13px] md:text-[14px] mt-1" style={{ color: "#999" }}>
          依照提示與地點搜尋，已比對 {checkedCount} 筆候選資料
        </p>

        {searching ? (
          <p className="text-[13px] mt-6" style={{ color: "#999" }}>搜尋與排序進行中...</p>
        ) : results.length === 0 ? (
          <p className="text-[13px] mt-6" style={{ color: "#999" }}>目前沒有符合條件的合法旅宿。</p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {results.map((hotel, index) => {
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.displayName} ${hotel.address}`)}`;

              return (
                <div
                  key={hotel.id}
                  className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6 rounded-[20px] border bg-white px-4 md:px-6 py-4 md:py-5"
                  style={{ borderColor: "#e0e0e0", boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.04)" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-[32px] h-[32px] md:w-[36px] md:h-[36px] rounded-full bg-[#141414] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[14px] md:text-[16px] font-bold">{index + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[16px] md:text-[18px] font-bold text-[#141414]">{hotel.displayName}</span>
                          <span className="h-[22px] px-2 rounded-[20px] text-[10px] md:text-[11px] leading-[22px]" style={{ background: "#f0f8ff", color: "#3abdff" }}>
                            AI 分數 {(hotel.score * 100).toFixed(0)}
                          </span>
                        </div>
                        <p className="text-[12px] md:text-[13px] mt-0.5" style={{ color: "#999" }}>
                          {[hotel.city, hotel.address].filter(Boolean).join(" ・ ")}
                        </p>
                      </div>
                    </div>
                    <div className="ml-[44px] md:ml-[52px]">
                      <div className="inline-flex items-center h-[24px] px-3 rounded-[8px] text-[11px] mb-2" style={{ background: "#e6f2e0", color: "#337326" }}>
                        ✓ {hotel.licenseNumber ? `旅館登記證 ${hotel.licenseNumber}` : "已通過合法旅宿比對"}
                      </div>
                      <p className="text-[12px] font-semibold mb-1" style={{ color: "#3abdff" }}>🤖 AI 排序摘要</p>
                      <p className="text-[12px] leading-[18px]" style={{ color: "#595959" }}>
                        來源：{hotel.source}。此結果由後端 /api/search-hotels 排序，推薦理由：{hotel.reason || "符合你的需求條件"}。
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 pt-1 md:flex-shrink-0 md:w-[236px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-[#141414]">合法狀態</span>
                      <span className="h-[22px] px-3 rounded-[10px] text-[11px] leading-[22px] font-semibold whitespace-nowrap" style={{ background: "#e0f4ff", color: "#3abdff" }}>AI 排序推薦</span>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-[40px] md:h-[44px] rounded-[14px] text-white text-[13px] md:text-[14px] font-semibold flex items-center justify-center"
                        style={{ background: "#3abdff" }}
                      >
                        在 Google Maps 查看 →
                      </a>
                      <button
                        onClick={() => void handleSaveHotel(hotel)}
                        disabled={savingHotelId === hotel.id}
                        className="w-full h-[32px] md:h-[33px] rounded-[10px] text-[12px] md:text-[13px] font-normal border-[1.5px] disabled:opacity-70"
                        style={{ borderColor: "#3abdff", color: "#3abdff" }}
                      >
                        {savingHotelId === hotel.id ? "儲存中..." : "加入我的行程"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[13px] mt-6" style={{ color: "#999" }}>以上結果由 Taibear 後端 API（/api/search-hotels）搜尋與排序產生</p>
      </section>
    </div>
  );
}

function BrowserMockup() {
  return (
    <div className="w-[360px] flex-shrink-0 rounded-[24px] overflow-hidden mt-4" style={{ background: "#d0efff" }}>
      <div className="mx-4 mt-4 h-[36px] rounded-[8px] flex items-center gap-2 px-3" style={{ background: "#2e2e2e" }}>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#ff5f57]" /><div className="w-2 h-2 rounded-full bg-[#febc2e]" /><div className="w-2 h-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 h-5 rounded-[6px] flex items-center px-2" style={{ background: "#404040" }}>
          <span className="text-[10px]" style={{ color: "#808080" }}>booking.com/hotel/tw/...</span>
        </div>
      </div>
      <div className="mx-4 mt-2 mb-4 flex gap-2 relative" style={{ height: 340 }}>
        <div className="w-[160px] rounded-[8px] overflow-hidden p-2 flex flex-col gap-2" style={{ background: "#262626" }}>
          <p className="text-[9px]" style={{ color: "#666" }}>Booking.com</p>
          <div className="h-[80px] rounded-[6px] flex items-center justify-center text-[32px]" style={{ background: "#334d73" }}>🏨</div>
          <p className="text-[10px] font-semibold text-white">台北商旅精選</p>
          <p className="text-[9px]" style={{ color: "#808080" }}>信義區・近101</p>
          <p className="text-[11px] font-bold" style={{ color: "#fec728" }}>NT$3,200</p>
        </div>
        <div className="absolute right-0 top-4 w-[164px] rounded-[16px] bg-white p-3 flex flex-col gap-2" style={{ boxShadow: "0px 8px 24px 0px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[18px] flex-shrink-0" style={{ background: "#fff6d8" }}>🛡️</div>
            <div><p className="text-[11px] font-bold text-[#141414]">訂房守門員</p><p className="text-[10px]" style={{ color: "#999" }}>Taibear</p></div>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="rounded-[10px] px-2 py-2" style={{ background: "#e5f7e8" }}>
            <p className="text-[11px] font-bold" style={{ color: "#2ebf59" }}>✓ 合法房源</p>
            <p className="text-[9px] leading-[14px] mt-0.5" style={{ color: "#338033" }}>台北市旅館業登記<br />證 NO.A0234</p>
          </div>
          <button className="w-full h-7 rounded-[8px] text-[10px] font-semibold text-white" style={{ background: "#3abdff" }}>加入 Taibear 行程 →</button>
          <p className="text-[9px] text-center" style={{ color: "#999" }}>已掃描 2,341 間・更新於今日</p>
        </div>
      </div>
    </div>
  );
}

function HotelSearchStatusCard({ searchSnapshot }: { searchSnapshot: SearchContextSnapshot | null }) {
  const promptText = searchSnapshot?.prompt || "未提供";
  const locationText = searchSnapshot?.location || "未指定";
  const selectedTagsText = searchSnapshot && searchSnapshot.selectedTags.length > 0
    ? searchSnapshot.selectedTags.join("、")
    : "未額外選擇前端標籤";
  const preferenceTagsText = searchSnapshot && searchSnapshot.relatedPreferenceTags.length > 0
    ? searchSnapshot.relatedPreferenceTags.join("、")
    : "我們會參考你在問卷中留下的個人偏好標籤";
  const preferenceSignalsText = searchSnapshot && searchSnapshot.preferenceSignals.length > 0
    ? searchSnapshot.preferenceSignals.join(" ｜ ")
    : "";

  return (
    <div
      className="mt-3 rounded-[16px] px-4 py-3"
      style={{
        background: "white",
        boxShadow: "0px 4px 16px rgba(58,189,255,0.14)",
        border: "1.5px solid rgba(58,189,255,0.18)",
      }}
    >
      <p className="text-[13px] font-semibold text-[#141414]">Taibear 正在搜尋旅宿中，已參考以下資料：</p>
      <div className="mt-1.5">
        <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
          搜尋需求：{promptText}
        </p>
        <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
          地點：{locationText}；已選標籤：{selectedTagsText}
        </p>
        <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
          根據我們對你的了解，這次會優先考慮你的偏好標籤：{preferenceTagsText}
        </p>
        {preferenceSignalsText ? (
          <p className="text-[11px] leading-[16px] break-words" style={{ color: "#595959" }}>
            另外也會參考：{preferenceSignalsText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type View = "extension" | "hotels";

export default function HotelsPage() {
  const [view, setView] = useState<View>("extension");
  const [fading, setFading] = useState(false);

  const switchTo = (next: View) => {
    if (next === view) return;
    setFading(true);
    setTimeout(() => { setView(next); setFading(false); }, 220);
  };

  return (
    <>
      {/* Mobile: always show hotels view, no extension promo */}
      <div className="block md:hidden">
        <HotelsView onSwitch={() => {}} showExtensionBtn={false} />
      </div>

      {/* Desktop: toggle between extension and hotels views */}
      <div
        className="hidden md:block"
        style={{ transition: "opacity 0.22s ease, transform 0.22s ease", opacity: fading ? 0 : 1, transform: fading ? "translateY(6px)" : "translateY(0)" }}
      >
        {view === "extension"
          ? <ExtensionView onSwitch={() => switchTo("hotels")} />
          : <HotelsView onSwitch={() => switchTo("extension")} />
        }
      </div>
    </>
  );
}
