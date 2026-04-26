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

const STATS = [
  { value: "50,000+", label: "次插件下載" },
  { value: "99.1%", label: "非法房源識別率" },
  { value: "< 1 秒", label: "即時比對速度" },
  { value: "免費", label: "完全不收費" },
];

function BrowserMockup() {
  return (
    <div className="w-[360px] flex-shrink-0 rounded-[24px] overflow-hidden mt-4" style={{ background: "#d0efff" }}>
      {/* Browser chrome */}
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

      {/* Page content */}
      <div className="mx-4 mt-2 mb-4 flex gap-2 relative" style={{ height: 340 }}>
        {/* Booking.com page mock */}
        <div className="w-[160px] rounded-[8px] overflow-hidden p-2 flex flex-col gap-2" style={{ background: "#262626" }}>
          <p className="text-[9px]" style={{ color: "#666" }}>Booking.com</p>
          <div className="h-[80px] rounded-[6px] flex items-center justify-center text-[32px]"
            style={{ background: "#334d73" }}>🏨</div>
          <p className="text-[10px] font-semibold text-white">台北商旅精選</p>
          <p className="text-[9px]" style={{ color: "#808080" }}>信義區・近101</p>
          <p className="text-[11px] font-bold" style={{ color: "#fec728" }}>NT$3,200</p>
          <p className="text-[9px]" style={{ color: "#808080" }}>⭐ 4.7</p>
        </div>

        {/* Extension popup overlay */}
        <div
          className="absolute right-0 top-4 w-[164px] rounded-[16px] bg-white p-3 flex flex-col gap-2"
          style={{ boxShadow: "0px 8px 24px 0px rgba(0,0,0,0.3)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[18px] flex-shrink-0"
              style={{ background: "#fff6d8" }}>🛡️</div>
            <div>
              <p className="text-[11px] font-bold text-[#141414]">訂房守門員</p>
              <p className="text-[10px]" style={{ color: "#999" }}>Taibear</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100" />

          {/* Legal badge */}
          <div className="rounded-[10px] px-2 py-2" style={{ background: "#e5f7e8" }}>
            <p className="text-[11px] font-bold" style={{ color: "#2ebf59" }}>✓ 合法房源</p>
            <p className="text-[9px] leading-[14px] mt-0.5" style={{ color: "#338033" }}>
              台北市旅館業登記<br />證 NO.A0234
            </p>
          </div>

          {/* CTA */}
          <button
            className="w-full h-7 rounded-[8px] text-[10px] font-semibold text-white"
            style={{ background: "#3abdff" }}
          >
            加入 Taibear 行程 →
          </button>

          <p className="text-[9px] text-center" style={{ color: "#999" }}>已掃描 2,341 間・更新於今日</p>
        </div>
      </div>
    </div>
  );
}

export default function ExtensionPage() {
  return (
    <div className="min-h-screen" style={{ background: "#f5f5f5" }}>

      {/* ── Hero ── */}
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
              className="h-[52px] px-8 rounded-[13px] text-[15px]"
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

      {/* ── Stats Bar ── */}
      <div className="bg-white flex items-center px-20 h-[72px]" style={{ borderBottom: "1px solid #f0f0f0" }}>
        {STATS.map((stat, i) => (
          <div key={stat.label} className="flex items-center">
            {i > 0 && <div className="w-px h-8 mx-16 bg-gray-200" />}
            <div>
              <p className="text-[18px] font-bold text-[#141414]">{stat.value}</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#999" }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Three Steps ── */}
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
