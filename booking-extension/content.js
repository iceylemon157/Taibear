/**
 * Taibear content script — booking.com + airbnb.com
 * 從頁面抓取：旅館名、GPS座標、執照號碼、地址、電話、房源類型
 * 頁面載入後主動掃描並存入 chrome.storage
 */

// 台灣執照號碼 pattern，例如「臺北市旅館業登記證第123號」「南投縣民宿358號」
const LICENSE_RE = /[一-鿿]{2,6}(?:旅館業?|民宿)\w{0,10}[第號]/;

const SITE = (() => {
  const h = location.hostname;
  if (h.includes("airbnb")) return "airbnb";
  if (h.includes("booking")) return "booking";
  return "unknown";
})();

/**
 * 偵測頁面語言：zh 代表中文（zh-tw / zh-cn），en 代表其他語言
 * Booking.com URL 包含 .zh-tw.html / .en-gb.html 等，也可看 <html lang>
 */
function detectLang() {
  // 1. URL 路徑（booking.com 最可靠：*.zh-tw.html / *.en-gb.html）
  const urlLang = location.pathname.match(/\.(zh[-_]?(?:tw|cn)?|en[-_]?\w*)\./i)?.[1] || "";
  if (/^zh/i.test(urlLang)) return "zh";
  if (/^en/i.test(urlLang)) return "en";
  // 2. <html lang> 屬性
  const htmlLang = document.documentElement.lang || "";
  if (/^zh/i.test(htmlLang)) return "zh";
  // 3. 預設視為非中文
  return "en";
}

// ─── Booking.com ───────────────────────────────────────────

function booking_extractName() {
  const selectors = [
    '[data-testid="property-header"] h2',
    'h2.pp-header__title',
    '.hp__hotel-name',
    'h1.hotel-name',
    '[data-capla-component*="Header"] h2',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

function booking_extractGPS() {
  // 1. JSON-LD
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const geo = data?.geo || data?.["@graph"]?.[0]?.geo;
      if (geo?.latitude && geo?.longitude)
        return { lat: parseFloat(geo.latitude), lng: parseFloat(geo.longitude) };
    } catch {}
  }
  // 2. data 屬性
  const mapEl = document.querySelector('[data-atlas-latlng], [data-lat][data-lng]');
  if (mapEl) {
    const latlng = mapEl.dataset.atlasLatlng;
    if (latlng) {
      const [lat, lng] = latlng.split(",").map(Number);
      if (lat && lng) return { lat, lng };
    }
    const lat = parseFloat(mapEl.dataset.lat);
    const lng = parseFloat(mapEl.dataset.lng);
    if (lat && lng) return { lat, lng };
  }
  // 3. window 全域
  try {
    const c = window.b_map_center || window.booking_map_center;
    if (c?.latitude && c?.longitude)
      return { lat: parseFloat(c.latitude), lng: parseFloat(c.longitude) };
  } catch {}
  return null;
}

function booking_extractAddress() {
  const selectors = [
    '[data-testid="property-location"] address',
    '.hp_address_subtitle',
    'span[data-testid="address"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

function booking_extractPhone() {
  const tel = document.querySelector('a[href^="tel:"]');
  if (tel) return tel.textContent.trim() || tel.href.replace("tel:", "");
  for (const sel of ['[data-testid="property-phone"]', '.hp-phone']) {
    const el = document.querySelector(sel);
    if (el?.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

function booking_extractPropertyType() {
  const el = document.querySelector(
    '[data-testid="property-type"], .hp__hotel-type, [class*="property-type"]'
  );
  return el?.textContent.trim() || null;
}

// ─── Airbnb ────────────────────────────────────────────────

function airbnb_extractNextData() {
  try {
    const el = document.getElementById("data-deferred-state") ||
               document.querySelector('script[id="data-deferred-state-0"]') ||
               document.querySelector('script[type="application/json"][id]');
    if (el) return JSON.parse(el.textContent);
  } catch {}
  try {
    return window.__NEXT_DATA__ || null;
  } catch {}
  return null;
}

function airbnb_extractName() {
  // h1 是最可靠的
  const h1 = document.querySelector('h1');
  if (h1?.textContent.trim()) return h1.textContent.trim();

  // JSON-LD
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      if (data?.name) return data.name;
    } catch {}
  }
  return null;
}

function airbnb_extractGPS() {
  // 1. JSON-LD（通常有 geo）
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const geo = data?.geo;
      if (geo?.latitude && geo?.longitude)
        return { lat: parseFloat(geo.latitude), lng: parseFloat(geo.longitude) };
    } catch {}
  }
  // 2. __NEXT_DATA__（Airbnb 把座標藏很深）
  try {
    const nd = airbnb_extractNextData();
    const listing = nd?.props?.pageProps?.listing ||
                    nd?.props?.pageProps?.listingInfo?.listing;
    const lat = listing?.lat || listing?.location?.lat;
    const lng = listing?.lng || listing?.location?.lng;
    if (lat && lng) return { lat: parseFloat(lat), lng: parseFloat(lng) };
  } catch {}
  return null;
}

function airbnb_extractAddress() {
  // Airbnb 訂房前故意隱藏精確地址，只顯示區域
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const addr = data?.address;
      if (addr) {
        const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion]
          .filter(Boolean);
        if (parts.length) return parts.join(", ");
      }
    } catch {}
  }
  // 顯示在頁面上的區域文字
  const el = document.querySelector(
    '[data-testid="listing-summary-location"], [data-section-id="OVERVIEW_DEFAULT"] h2'
  );
  return el?.textContent.trim() || null;
}

function airbnb_extractPropertyType() {
  // "整棟公寓出租" / "私人房間" / "共用房間" 等
  const el = document.querySelector(
    '[data-section-id="OVERVIEW_DEFAULT"] h2, [data-section-id="OVERVIEW_DEFAULT_V2"] h2'
  );
  if (el?.textContent.trim()) return el.textContent.trim();

  try {
    const nd = airbnb_extractNextData();
    const listing = nd?.props?.pageProps?.listing ||
                    nd?.props?.pageProps?.listingInfo?.listing;
    return listing?.room_type_category || listing?.roomTypeCategory || null;
  } catch {}
  return null;
}

// ─── 共用邏輯 ───────────────────────────────────────────────

function extractLicenseNumber() {
  // 1. 「執照號碼：」標籤精確比對（最可靠，不依賴 selector 結構）
  for (const el of document.querySelectorAll('p, span, li, div')) {
    const text = el.childElementCount === 0 ? el.textContent.trim() : "";
    if (/^執照號碼[：:]/.test(text)) {
      const val = text.replace(/^執照號碼[：:]\s*/, "").trim();
      if (val) return val;
    }
  }

  // 2. XPath 定位（Booking.com 目前結構的已知位置）
  try {
    const xpathResult = document.evaluate(
      '/html/body/div[4]/div/div[4]/main/div/div[3]/div[6]/div/div/div[12]/div/section/div/div[2]/div/div/p[2]',
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    );
    const xpathEl = xpathResult.singleNodeValue;
    if (xpathEl?.textContent) {
      const val = xpathEl.textContent.replace(/^執照號碼[：:]\s*/, "").trim();
      if (val) return val;
    }
  } catch {}

  // 3. 候選 selector 搭配 regex
  const candidates = [
    '[data-testid="property-description"]',
    '[data-section-id="DESCRIPTION_DEFAULT"]',
    '.hp-desc-highlights',
    '.hotel_description_wrapper',
    'footer',
  ];
  for (const sel of candidates) {
    for (const el of document.querySelectorAll(sel)) {
      const match = el.textContent.match(LICENSE_RE);
      if (match) return match[0];
    }
  }

  // 4. 全頁 fallback
  const match = document.body.innerText.match(LICENSE_RE);
  return match ? match[0] : null;
}

// 等待執照號碼出現（Booking.com 此段落為動態載入，最多等 8 秒）
async function waitForLicense(maxMs = 8000, intervalMs = 800) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const license = extractLicenseNumber();
    if (license) return license;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ─── 浮動卡片 ───────────────────────────────────────────────

let floatRoot = null;

function getFloat() {
  if (floatRoot) return floatRoot.shadowRoot;
  const host = document.createElement("div");
  host.id = "taibear-float-host";
  document.body.appendChild(host);
  floatRoot = host;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      #card {
        position: fixed;
        top: 80px;
        right: -320px;
        width: 280px;
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.13);
        border: 0.5px solid #e0e0e0;
        font-family: 'Inter', 'Noto Sans TC', sans-serif;
        z-index: 2147483647;
        transition: right 0.35s cubic-bezier(0.34,1.56,0.64,1);
        overflow: hidden;
      }
      #card.show { right: 16px; }
      .tb-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        background: #fff;
        border-bottom: 0.5px solid #e0e0e0;
      }
      .tb-logo {
        width: 40px; height: 40px;
        border-radius: 10px;
        overflow: hidden; flex-shrink: 0;
      }
      .tb-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .tb-title { flex: 1; }
      .tb-brand { font-size: 13px; font-weight: 600; color: #1a1a1a; display: block; }
      .tb-sub   { font-size: 9px; color: #a6a6a6; display: block; }
      .tb-badge {
        font-size: 10px; font-weight: 600;
        padding: 3px 9px; border-radius: 10px;
        white-space: nowrap;
        background: #f7f7f5; color: #a6a6a6;
      }
      .tb-badge.safe   { background: #eaf3de; color: #27500a; }
      .tb-badge.unsafe { background: #fcebeb; color: #791f1f; }
      .tb-close {
        background: none; border: none; cursor: pointer;
        color: #ccc; font-size: 16px; line-height: 1;
        padding: 0 0 0 6px;
      }
      .tb-body { padding: 12px 14px; }
      .tb-hotel { font-size: 12px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
      .tb-msg   { font-size: 11px; line-height: 1.5; margin: 0; }
      .tb-msg.safe   { color: #3b7011; }
      .tb-msg.unsafe { color: #a31f1f; }
      .tb-spinner {
        width: 20px; height: 20px;
        border: 2px solid #e0e0e0; border-top-color: #1a1a2e;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 4px auto 8px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .tb-scanning { text-align: center; font-size: 11px; color: #a6a6a6; padding: 4px 0 2px; }
    </style>
    <div id="card">
      <div class="tb-header">
        <div class="tb-logo"><img src="${chrome.runtime.getURL("icons/icon48.png")}" /></div>
        <div class="tb-title">
          <span class="tb-brand">Taibear</span>
          <span class="tb-sub">訂房安全守門員</span>
        </div>
        <span class="tb-badge" id="tb-badge">確認中...</span>
        <button class="tb-close" id="tb-close">×</button>
      </div>
      <div class="tb-body" id="tb-body">
        <div class="tb-spinner"></div>
        <p class="tb-scanning">正在比對合法旅宿資料庫...</p>
      </div>
    </div>
  `;
  shadow.getElementById("tb-close").addEventListener("click", () => {
    shadow.getElementById("card").classList.remove("show");
  });
  return shadow;
}

const FLOAT_I18N = {
  zh: {
    scanning: "確認中...",
    scanningBody: "正在比對合法旅宿資料庫...",
    safe: "合法認證",
    safMsg: "✓ 已列於觀光署合法旅宿名冊，可安心入住。",
    unsafe: "風險警示",
    unsafeMsg: "⚠ 查無合法登記，請點擊圖示查看詳細風險。",
    unknown: "未知房源",
    sub: "訂房安全守門員",
  },
  en: {
    scanning: "Checking...",
    scanningBody: "Verifying against Taiwan legal accommodation database...",
    safe: "Verified Legal",
    safMsg: "✓ Listed in Taiwan Tourism Bureau's legal accommodation registry.",
    unsafe: "Risk Warning",
    unsafeMsg: "⚠ Not found in legal registry. Tap the icon for details.",
    unknown: "Unknown property",
    sub: "Booking Safety Guard",
  },
};

function showFloat(state, hotelData, lang = "zh") {
  const shadow = getFloat();
  const card   = shadow.getElementById("card");
  const badge  = shadow.getElementById("tb-badge");
  const body   = shadow.getElementById("tb-body");
  const t      = FLOAT_I18N[lang] ?? FLOAT_I18N.en;

  // 更新副標題（語言切換時同步）
  const subEl = shadow.querySelector(".tb-sub");
  if (subEl) subEl.textContent = t.sub;

  if (state === "scanning") {
    badge.className = "tb-badge";
    badge.textContent = t.scanning;
    body.innerHTML = `<div class="tb-spinner"></div><p class="tb-scanning">${t.scanningBody}</p>`;
  } else if (state === "safe") {
    badge.className = "tb-badge safe";
    badge.textContent = t.safe;
    body.innerHTML = `
      <p class="tb-hotel">${hotelData?.name || ""}</p>
      <p class="tb-msg safe">${t.safMsg}</p>
    `;
  } else if (state === "unsafe") {
    badge.className = "tb-badge unsafe";
    badge.textContent = t.unsafe;
    body.innerHTML = `
      <p class="tb-hotel">${hotelData?.name || t.unknown}</p>
      <p class="tb-msg unsafe">${t.unsafeMsg}</p>
    `;
  }

  requestAnimationFrame(() => card.classList.add("show"));
}

// ─── 掃描主流程 ─────────────────────────────────────────────

async function scanAndStore() {
  let name, gps, address, phone, propertyType;

  if (SITE === "airbnb") {
    // Airbnb 是 SPA，等 h1 出現再抓
    const h1 = document.querySelector("h1");
    if (!h1) return; // 還沒渲染，等 MutationObserver 觸發
    name         = airbnb_extractName();
    gps          = airbnb_extractGPS();
    address      = airbnb_extractAddress();
    phone        = null; // Airbnb 不顯示電話
    propertyType = airbnb_extractPropertyType();
  } else {
    name         = booking_extractName();
    gps          = booking_extractGPS();
    address      = booking_extractAddress();
    phone        = booking_extractPhone();
    propertyType = booking_extractPropertyType();
  }

  // 不是單一房源頁面就不顯示
  if (!name && !gps) return;

  const lang = detectLang(); // "zh" | "en"
  showFloat("scanning", null, lang);

  // Booking.com 的執照號碼段落為動態載入，等待最多 8 秒
  const license = SITE === "booking"
    ? await waitForLicense()
    : extractLicenseNumber();

  const payload = {
    name,
    lang,
    lat:           gps?.lat ?? null,
    lng:           gps?.lng ?? null,
    licenseNumber: license,
    address,
    phone,
    propertyType,
    source:        SITE,
    source_url:    location.href,
    scannedAt:     Date.now(),
  };

  chrome.storage.local.set({ taibear_hotel: payload });

  chrome.runtime.sendMessage({
    action: "checkHotel",
    data: {
      // 英文頁面時以 name_en 欄位送出，讓後端優先比對英文名稱
      name:          payload.name,
      name_en:       lang !== "zh" ? payload.name : undefined,
      lat:           payload.lat,
      lng:           payload.lng,
      licenseNumber: license,
      address:       payload.address,
      source:        SITE,
      lang,
    },
  }, (response) => {
    if (response?.success) {
      chrome.storage.local.set({ taibear_result: response.data });
      const displayData = response.data.legal
        ? { ...response.data.hotel, name: payload.name || response.data.hotel?.name }
        : payload;
      showFloat(response.data.legal ? "safe" : "unsafe", displayData, lang);
    } else {
      chrome.storage.local.set({ taibear_result: null });
      showFloat("unsafe", payload, lang);
    }
  });
}

// popup 主動問
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getHotelData") {
    chrome.storage.local.get(["taibear_hotel", "taibear_result"], (data) => {
      sendResponse({
        hotel:  data.taibear_hotel  ?? null,
        result: data.taibear_result ?? null,
      });
    });
    return true;
  }
});

// 頁面載入後自動掃描
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanAndStore);
} else {
  scanAndStore();
}

// SPA 換頁重新掃（booking.com & airbnb 都是 SPA）
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(scanAndStore, 1500);
  }
}).observe(document.body, { childList: true, subtree: true });
