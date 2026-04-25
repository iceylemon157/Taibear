"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api/client";
import { agentService, dedupeSavedHotels } from "@/services/api/services";
import type { SavedHotel } from "@/services/api/types";

// ── Extension view data ──────────────────────────────────────────────────────

const STEPS = [
  {
    num: "1", bg: "#3abdff", textColor: "white", emoji: "⬇️",
    title: "一鍵安裝到 Chrome",
    desc: "從 Chrome 線上應用程式商店免費安裝，30 秒完成",
  },
  {
    num: "2", bg: "#fec728", textColor: "#141414", emoji: "🔍",
    title: "前往任何訂房網站",
    desc: "支援 Booking.com、Agoda、Airbnb 等主流平台",
  },
  {
    num: "3", bg: "#2ebf59", textColor: "white", emoji: "🛡️",
    title: "即時偵測・自動把關",
    desc: "插件自動比對台灣合法旅館登記資料，發現異常立即警告",
  },
];

const EXT_STATS = [
  { value: "50,000+", label: "次插件下載" },
  { value: "99.1%", label: "非法房源識別率" },
  { value: "< 1 秒", label: "即時比對速度" },
  { value: "免費", label: "完全不收費" },
];

// ── Hotels view data ─────────────────────────────────────────────────────────

const STYLE_TAGS = [
  { label: "捷運站旁", active: true },
  { label: "文青風格", active: true },
  { label: "CP 值高", active: true },
  { label: "奢華體驗", active: false },
  { label: "鄰近夜市", active: false },
  { label: "免費停車", active: false },
  { label: "寵物友善", active: false },
];

const HOTELS = [
  {
    rank: 1, name: "大稻埕古風旅宿", area: "台北市大同區・迪化街一段",
    cert: "台北市旅館業登記證 NO.A0234", price: "NT$2,800", unit: "/ 晚",
    rating: "⭐ 4.9", badge: "文化氛圍", tags: ["文化", "步行友善", "早餐included"],
    review: "乾淨寬敞，早餐豐盛多樣。老闆非常熱情，主動推薦附近的在地小吃與景點。房間雖然不大，但設計充滿古典台灣風情，非常適合想深入體驗大稻埕文化的旅客。",
  },
  {
    rank: 2, name: "信義設計旅店 The STAY", area: "台北市信義區・市政府路",
    cert: "台北市旅館業登記證 NO.B1128", price: "NT$3,500", unit: "/ 晚",
    rating: "⭐ 4.7", badge: "設計旅店", tags: ["設計感", "交通便利", "夜景"],
    review: "地點絕佳，走路就能到101與微風廣場。房間設計現代簡約，隔音效果出色。101景觀房特別值得升級，夜景讓人驚艷。唯獨停車費用偏高，自行開車需注意。",
  },
  {
    rank: 3, name: "北投老爺溫泉旅館", area: "台北市北投區・中山路",
    cert: "台北市溫泉旅館業登記證 NO.SP088", price: "NT$4,800", unit: "/ 晚",
    rating: "⭐ 4.8", badge: "溫泉體驗", tags: ["溫泉", "放鬆", "療癒"],
    review: "私人湯屋品質極佳，水質清澈、硫磺味適中。周圍環境清幽，非常適合需要放鬆療癒的旅行。餐廳的和風料理令人滿意，服務態度專業親切，是台北溫泉住宿的首選。",
  },
  {
    rank: 4, name: "師大巷弄文青旅宿", area: "台北市大安區・師大路",
    cert: "台北市旅館業登記證 NO.C0567", price: "NT$2,200", unit: "/ 晚",
    rating: "⭐ 4.6", badge: "文青風格", tags: ["文青", "生活感", "CP值高"],
    review: "位於師大商圈巷弄內，生活機能超強。房間走日系文青風，細節用心。樓下就是特色咖啡廳，早上不愁早餐。唯一小缺點是停車不便，建議搭乘大眾運輸。",
  },
  {
    rank: 5, name: "西門町背包客棧 Hostel 88", area: "台北市萬華區・峨眉街",
    cert: "台北市旅館業登記證 NO.D0341", price: "NT$980", unit: "/ 床位",
    rating: "⭐ 4.5", badge: "背包客友善", tags: ["背包客", "社交", "超划算"],
    review: "西門町最具代表性的青年旅舍之一，交通四通八達。工作人員英文流利，對外國旅客十分友善。公共空間寬敞舒適，認識來自世界各地旅人的好地方。CP值無敵高。",
  },
];

const HOTEL_STATS = [
  { value: "12,483", label: "位旅客受保護" },
  { value: "98.7%", label: "合法認證準確率" },
  { value: "5 秒", label: "平均審查速度" },
  { value: "免費", label: "完全不收費" },
];

const BAR_HEIGHTS = [90, 70, 82, 62, 88, 78, 66, 84];

// ── Sub-components ────────────────────────────────────────────────────────────

function BrowserMockup() {
  return (
    <div className="w-[360px] flex-shrink-0 rounded-[24px] overflow-hidden mt-4" style={{ background: "#d0efff" }}>
      <div className="mx-4 mt-4 h-[36px] rounded-[8px] flex items-center gap-2 px-3" style={{ background: "#2e2e2e" }}>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#ff5f57]" />
          <div className="w-2 h-2 rounded-full bg-[#febc2e]" />
          <div className="w-2 h-2 rounded-full bg-[#28c840]" />
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
          <p className="text-[9px]" style={{ color: "#808080" }}>⭐ 4.7</p>
        </div>
        <div
          className="absolute right-0 top-4 w-[164px] rounded-[16px] bg-white p-3 flex flex-col gap-2"
          style={{ boxShadow: "0px 8px 24px 0px rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[18px] flex-shrink-0" style={{ background: "#fff6d8" }}>🛡️</div>
            <div>
              <p className="text-[11px] font-bold text-[#141414]">訂房守門員</p>
              <p className="text-[10px]" style={{ color: "#999" }}>Taibear</p>
            </div>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="rounded-[10px] px-2 py-2" style={{ background: "#e5f7e8" }}>
            <p className="text-[11px] font-bold" style={{ color: "#2ebf59" }}>✓ 合法房源</p>
            <p className="text-[9px] leading-[14px] mt-0.5" style={{ color: "#338033" }}>台北市旅館業登記<br />證 NO.A0234</p>
          </div>
          <button className="w-full h-7 rounded-[8px] text-[10px] font-semibold text-white" style={{ background: "#3abdff" }}>
            加入 Taibear 行程 →
          </button>
          <p className="text-[9px] text-center" style={{ color: "#999" }}>已掃描 2,341 間・更新於今日</p>
        </div>
      </div>
    </div>
  );
}

function StatsBar({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div className="bg-white flex items-center px-20 h-[72px]" style={{ borderBottom: "1px solid #f0f0f0" }}>
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
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function ExtensionView({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="min-h-screen" style={{ background: "#f5f5f5" }}>
      <section
        className="relative overflow-hidden px-[72px] pt-[85px] pb-[60px] flex items-start gap-10"
        style={{
          background: "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)",
          minHeight: 490,
        }}
      >
        <div className="flex-1 pt-2">
          <h1 className="text-[76px] font-bold leading-tight text-white">訂房守門員</h1>
          <h1 className="text-[76px] font-bold leading-tight" style={{ color: "#fec728" }}>
            自己找，我幫你把關。
          </h1>
          <p className="mt-6 text-[17px] max-w-[540px]" style={{ color: "#8c8c8c" }}>
            瀏覽訂房網站時，Taibear 插件即時比對合法資料庫，提前揪出非法業者。
          </p>
          <div className="flex gap-4 mt-8">
            <button
              onClick={onSwitch}
              className="h-[52px] px-8 rounded-[13px] text-[15px] transition-colors hover:bg-black/5"
              style={{ border: "1.5px solid #616161", color: "#a6a6a6" }}
            >
              找合法住宿 →
            </button>
            <button
              className="h-[52px] px-8 rounded-[13px] text-[#141414] text-[16px] font-semibold"
              style={{ background: "#fec728" }}
            >
              立即安裝插件
            </button>
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
            <div
              key={step.num}
              className="bg-white rounded-[20px] p-5 relative"
              style={{ boxShadow: "0px 4px 12px 0px rgba(0,0,0,0.04)", minHeight: 170 }}
            >
              <div className="flex items-start justify-between mb-6">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] font-bold flex-shrink-0"
                  style={{ background: step.bg, color: step.textColor }}
                >
                  {step.num}
                </div>
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

function HotelsView({ onSwitch }: { onSwitch: () => void }) {
  const [tags, setTags] = useState(STYLE_TAGS);
  const [prompt, setPrompt] = useState("");
  const [savedHotels, setSavedHotels] = useState<SavedHotel[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [syncingHotelName, setSyncingHotelName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const toggleTag = (i: number) =>
    setTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, active: !t.active } : t)));

  const activeTagLabels = useMemo(
    () => tags.filter((tag) => tag.active).map((tag) => tag.label),
    [tags]
  );

  async function refreshSavedHotels() {
    setLoadingSaved(true);
    try {
      const response = await agentService.listSavedHotels();
      setSavedHotels(dedupeSavedHotels(response.hotels || []));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("讀取收藏住宿失敗，請稍後再試。");
      }
    } finally {
      setLoadingSaved(false);
    }
  }

  async function handleCheckPrompt() {
    setErrorMessage("");
    setSuccessMessage("");

    const query = prompt.trim();
    if (!query) {
      setErrorMessage("請先輸入想查詢的旅宿名稱或條件。");
      return;
    }

    try {
      const result = await agentService.checkHotel({
        name: query,
        source: "booking",
      });

      if (result.legal && result.hotel) {
        const hotelName =
          typeof result.hotel === "object" && result.hotel !== null && "name" in result.hotel
            ? String((result.hotel as { name: unknown }).name)
            : query;
        setSuccessMessage(`查詢結果：${hotelName} 為合法旅宿。`);
      } else {
        const warning =
          typeof result.warning === "string" && result.warning.length > 0
            ? result.warning
            : "查無合法資料，請再確認旅宿名稱或改用收藏功能。";
        setErrorMessage(warning);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("合法性查詢失敗，請稍後再試。");
      }
    }
  }

  async function handleSaveHotel(hotel: (typeof HOTELS)[number]) {
    setErrorMessage("");
    setSuccessMessage("");
    setSyncingHotelName(hotel.name);

    try {
      const legalResult = await agentService.checkHotel({
        name: hotel.name,
        source: "booking",
      });

      await agentService.saveHotel({
        display_name: hotel.name,
        address: hotel.area,
        source: "booking",
        source_url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}`,
        hotel_id:
          legalResult.legal && legalResult.hotel && typeof legalResult.hotel === "object" && "hotel_id" in legalResult.hotel
            ? String((legalResult.hotel as { hotel_id: unknown }).hotel_id)
            : undefined,
      });

      setSuccessMessage(`已加入收藏：${hotel.name}`);
      await refreshSavedHotels();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("收藏失敗，請稍後再試。");
      }
    } finally {
      setSyncingHotelName("");
    }
  }

  useEffect(() => {
    void refreshSavedHotels();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#f5f5f5" }}>
      <section
        className="relative overflow-hidden px-[72px] pt-[85px] pb-[60px] flex items-start gap-10"
        style={{ background: "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)", minHeight: 408 }}
      >
        <div className="flex-1">
          <h1 className="text-[76px] font-bold leading-tight text-white">安心住宿</h1>
          <h1 className="text-[76px] font-bold leading-tight" style={{ color: "#ffd26a" }}>從這裡開始。</h1>
          <p className="mt-6 text-[17px] max-w-[540px]" style={{ color: "#8c8c8c" }}>
            Taibear 比對合法登記資料，幫你找到真正安全的好房源。
          </p>
          <div className="flex gap-4 mt-8">
            <button
              onClick={handleCheckPrompt}
              className="h-[52px] px-8 rounded-[13px] text-white text-[16px] font-semibold"
              style={{ background: "#3abdff" }}
            >
              找合法住宿
            </button>
            <button
              onClick={onSwitch}
              className="h-[52px] px-8 rounded-[13px] text-white text-[15px] font-extrabold border-2 border-white transition-colors hover:bg-white/10"
            >
              安裝守門員插件 →
            </button>
          </div>
        </div>

        <div className="w-[360px] rounded-[24px] overflow-hidden flex-shrink-0 mt-4" style={{ background: "#d0efff" }}>
          <div
            className="relative h-[170px] mx-6 mt-6 rounded-[12px] overflow-hidden flex items-end px-4 gap-3"
            style={{ background: "linear-gradient(to top, #1a73e5, #99d9ff)" }}
          >
            {BAR_HEIGHTS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: h, background: "#0f1a33" }} />
            ))}
            <div
              className="absolute top-4 right-4 h-[32px] px-3 rounded-[10px] flex items-center text-[13px] font-semibold border"
              style={{ background: "rgba(58,189,255,0.12)", borderColor: "rgba(58,189,255,0.4)", color: "#3abdff" }}
            >
              ✓ 合法認證房源
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-[16px] font-semibold text-white">大稻埕古風旅宿</p>
            <p className="text-[12px] mt-1" style={{ color: "#737373" }}>⭐ 4.9 · 台北市大同區 · NT$2,800/晚</p>
            <button className="mt-3 h-[36px] w-[100px] rounded-[10px] text-white text-[13px] font-semibold" style={{ background: "#3abdff" }}>
              Maps →
            </button>
          </div>
        </div>
      </section>

      <StatsBar stats={HOTEL_STATS} />

      <section className="px-20 py-10" style={{ background: "#f5f5f5" }}>
        <h2 className="text-[22px] font-bold text-[#141414]">選擇你的喜好</h2>
        <p className="text-[15px] mt-1" style={{ color: "#999" }}>Taibear 根據你的偏好，從合法房源資料庫精準推薦</p>
        <p className="text-[14px] font-semibold mt-4 mb-3" style={{ color: "#999" }}>✦ 你的住宿風格</p>
        <div className="flex flex-wrap gap-2 mb-5">
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
        <div className="relative rounded-[20px] border-2 bg-white" style={{ borderColor: "#3abdff", minHeight: 159 }}>
          <textarea
            className="w-full h-[120px] pt-[18px] px-[18px] text-[15px] resize-none outline-none bg-transparent"
            style={{ color: "#1a1a1a" }}
            placeholder={"告訴 Taibear 這次住宿的任何想法...\n\n例如：西門町、四人房、交通方便"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            className="absolute bottom-3 right-3 w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-white text-[18px]"
            style={{ background: "#3abdff" }}
          >
            ↑
          </button>
        </div>
        <button
          onClick={handleCheckPrompt}
          className="w-full h-[56px] rounded-[16px] text-white text-[17px] font-semibold mt-4"
          style={{ background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }}
        >
          ✦ 檢查輸入條件是否合法旅宿 →
        </button>

        {errorMessage ? (
          <p className="text-[13px] mt-3" style={{ color: "#d9534f" }}>
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-[13px] mt-3" style={{ color: "#2ebf59" }}>
            {successMessage}
          </p>
        ) : null}

        <p className="text-[12px] mt-3" style={{ color: "#999" }}>
          已選擇偏好：{activeTagLabels.join("、")}
        </p>
      </section>

      <section className="bg-white px-[72px] py-12">
        <h2 className="text-[20px] font-semibold text-[#141414]">✦ 為你找到 5 間合法住宿</h2>
        <p className="text-[14px] mt-1" style={{ color: "#999" }}>根據你的喜好精選，附合法登記證明與 AI 評論摘要</p>
        <div className="mt-6 flex flex-col gap-4">
          {HOTELS.map((hotel) => (
            <div
              key={hotel.rank}
              className="flex items-start gap-6 rounded-[20px] border bg-white px-6 py-5"
              style={{ borderColor: "#e0e0e0", boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.04)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-[36px] h-[36px] rounded-full bg-[#141414] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[16px] font-bold">{hotel.rank}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[18px] font-bold text-[#141414]">{hotel.name}</span>
                      {hotel.tags.map((t) => (
                        <span key={t} className="h-[24px] px-3 rounded-[20px] text-[11px] leading-[24px]"
                          style={{ background: "#f5f5f5", color: "#999" }}>{t}</span>
                      ))}
                    </div>
                    <p className="text-[13px] mt-0.5" style={{ color: "#999" }}>{hotel.area}</p>
                  </div>
                </div>
                <div className="ml-[52px]">
                  <div className="inline-flex items-center h-[24px] px-3 rounded-[8px] text-[11px] mb-2"
                    style={{ background: "#e6f2e0", color: "#337326" }}>
                    ✓ {hotel.cert}
                  </div>
                  <p className="text-[12px] font-semibold mb-1" style={{ color: "#3abdff" }}>🤖 AI 評論摘要</p>
                  <p className="text-[12px] leading-[18px] max-w-[640px]" style={{ color: "#595959" }}>{hotel.review}</p>
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col items-start gap-2 pt-1" style={{ minWidth: 236 }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[22px] font-bold text-[#141414]">{hotel.price}</span>
                  <span className="text-[13px]" style={{ color: "#999" }}>{hotel.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[#141414]">{hotel.rating}</span>
                  <span className="h-[22px] px-3 rounded-[10px] text-[11px] leading-[22px] font-semibold"
                    style={{ background: "#e0f4ff", color: "#3abdff" }}>{hotel.badge}</span>
                </div>
                <button
                  className="w-[236px] h-[44px] rounded-[14px] text-white text-[14px] font-semibold"
                  style={{ background: "#3abdff" }}
                >
                  在 Google Maps 查看 →
                </button>
                <button
                  onClick={() => void handleSaveHotel(hotel)}
                  disabled={syncingHotelName === hotel.name}
                  className="w-[236px] h-[33px] rounded-[10px] text-[13px] font-normal border-[1.5px]"
                  style={{ borderColor: "#3abdff", color: "#3abdff" }}
                >
                  {syncingHotelName === hotel.name ? "儲存中..." : "加入我的行程"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[13px] mt-6" style={{ color: "#999" }}>
          以上房源均已通過 Taibear 合法資料庫比對 ✓ 資料每日更新
        </p>

        <div className="mt-10 border-t pt-8" style={{ borderColor: "#efefef" }}>
          <h3 className="text-[18px] font-semibold text-[#141414]">你的已收藏住宿</h3>
          <p className="text-[13px] mt-1" style={{ color: "#999" }}>
            與 Agent `/api/saved-hotels` 即時同步
          </p>

          {loadingSaved ? (
            <p className="mt-4 text-[13px]" style={{ color: "#999" }}>讀取收藏住宿中...</p>
          ) : savedHotels.length === 0 ? (
            <p className="mt-4 text-[13px]" style={{ color: "#999" }}>尚未收藏旅宿。</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedHotels.map((hotel) => (
                <div
                  key={`${hotel.source}-${hotel.id}`}
                  className="rounded-[14px] border px-4 py-3"
                  style={{ borderColor: "#e5e5e5" }}
                >
                  <p className="text-[14px] font-semibold text-[#141414]">{hotel.display_name}</p>
                  <p className="text-[12px] mt-1" style={{ color: "#777" }}>
                    {hotel.address || "地址未提供"}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: "#999" }}>
                    source: {hotel.source} · saved_at: {hotel.saved_at || "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type View = "extension" | "hotels";

export default function HotelsPage() {
  const [view, setView] = useState<View>("extension");
  const [fading, setFading] = useState(false);

  const switchTo = (next: View) => {
    if (next === view) return;
    setFading(true);
    setTimeout(() => {
      setView(next);
      setFading(false);
    }, 220);
  };

  return (
    <div
      style={{
        transition: "opacity 0.22s ease, transform 0.22s ease",
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(6px)" : "translateY(0)",
      }}
    >
      {view === "extension" ? (
        <ExtensionView onSwitch={() => switchTo("hotels")} />
      ) : (
        <HotelsView onSwitch={() => switchTo("extension")} />
      )}
    </div>
  );
}
