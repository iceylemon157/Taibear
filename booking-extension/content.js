/**
 * Taibear content script — booking.com + airbnb.com
 * 從頁面抓取：旅館名、GPS座標、執照號碼、地址、電話、房源類型
 * 頁面載入後主動掃描並存入 chrome.storage
 */

// ─── Logger ────────────────────────────────────────────────
// 所有 log 都帶 [Taibear] prefix，區分 level，且記錄到 chrome.storage
// 供 popup 的 debug panel 使用（未來功能）

const tbLog = (() => {
  const PREFIX = "[Taibear]";
  const MAX_ENTRIES = 50;

  function write(level, msg, data) {
    const entry = {
      ts:    new Date().toISOString(),
      level,
      site:  typeof SITE !== "undefined" ? SITE : "?",
      url:   location.pathname.slice(0, 80),
      msg,
      ...(data !== undefined ? { data } : {}),
    };
    // 印到 devtools console
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`${PREFIX}[${level.toUpperCase()}] ${msg}`, data ?? "");

    // 非同步寫到 storage（不阻塞主流程，失敗忽略）
    try {
      chrome.storage.local.get("taibear_logs", (res) => {
        if (chrome.runtime.lastError) return;
        const logs = Array.isArray(res.taibear_logs) ? res.taibear_logs : [];
        logs.unshift(entry);
        chrome.storage.local.set({ taibear_logs: logs.slice(0, MAX_ENTRIES) });
      });
    } catch {}
  }

  return {
    info:  (msg, data) => write("info",  msg, data),
    warn:  (msg, data) => write("warn",  msg, data),
    error: (msg, data) => write("error", msg, data),
  };
})();

// ─── 常數 ──────────────────────────────────────────────────

// 台灣執照號碼 pattern，例如「臺北市旅館業登記證第123號」「南投縣民宿358號」
const LICENSE_RE = /[一-鿿]{2,6}(?:旅館業?|民宿)\w{0,10}[第號]/;

const SITE = (() => {
  const h = location.hostname;
  if (h.includes("airbnb")) return "airbnb";
  if (h.includes("booking")) return "booking";
  return "unknown";
})();

tbLog.info(`content script loaded`, { site: SITE });

// ─── 語言偵測 ───────────────────────────────────────────────

/**
 * 偵測頁面語言：zh 代表中文，en 代表其他
 * - Booking.com: URL 含 .zh-tw.html / .en-gb.html
 * - Airbnb: <html lang> 或 URL query locale=zh_TW
 */
function detectLang() {
  // Booking.com URL pattern: *.zh-tw.html / *.en-gb.html
  const urlLang = location.pathname.match(/\.(zh[-_]?(?:tw|cn)?|en[-_]?\w*)\./i)?.[1] || "";
  if (/^zh/i.test(urlLang)) return "zh";
  if (/^en/i.test(urlLang)) return "en";

  // Airbnb URL query: ?locale=zh_TW or &locale=zh_HK
  const localeParam = new URLSearchParams(location.search).get("locale") || "";
  if (/^zh/i.test(localeParam)) return "zh";
  if (localeParam) return "en"; // 有 locale 但非中文

  // <html lang> 屬性
  const htmlLang = document.documentElement.lang || "";
  if (/^zh/i.test(htmlLang)) return "zh";
  if (/^en/i.test(htmlLang)) return "en";

  return "en"; // 預設非中文
}

// ─── Booking.com extractors ─────────────────────────────────

function booking_extractName() {
  const selectors = [
    '[data-testid="property-header"] h2',
    'h2.pp-header__title',
    '.hp__hotel-name',
    'h1.hotel-name',
    '[data-capla-component*="Header"] h2',
    'h1[class*="title"]',
    'h1[class*="hotel"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) return el.textContent.trim();
    } catch (e) {
      tbLog.warn(`booking_extractName selector failed: ${sel}`, e.message);
    }
  }
  tbLog.warn("booking_extractName: all selectors failed");
  return null;
}

function booking_extractGPS() {
  // 1. JSON-LD
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const geo = data?.geo || data?.["@graph"]?.[0]?.geo;
      if (geo?.latitude && geo?.longitude) {
        const lat = parseFloat(geo.latitude), lng = parseFloat(geo.longitude);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
    } catch {}
  }
  // 2. data 屬性
  try {
    const mapEl = document.querySelector('[data-atlas-latlng], [data-lat][data-lng]');
    if (mapEl) {
      const latlng = mapEl.dataset.atlasLatlng;
      if (latlng) {
        const [lat, lng] = latlng.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng) && lat && lng) return { lat, lng };
      }
      const lat = parseFloat(mapEl.dataset.lat);
      const lng = parseFloat(mapEl.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat && lng) return { lat, lng };
    }
  } catch (e) {
    tbLog.warn("booking_extractGPS data-attr failed", e.message);
  }
  // 3. window globals
  try {
    const c = window.b_map_center || window.booking_map_center;
    if (c?.latitude && c?.longitude)
      return { lat: parseFloat(c.latitude), lng: parseFloat(c.longitude) };
  } catch {}
  tbLog.warn("booking_extractGPS: no GPS found");
  return null;
}

function booking_extractAddress() {
  const selectors = [
    '[data-testid="property-location"] address',
    '.hp_address_subtitle',
    'span[data-testid="address"]',
    '[data-testid="address"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) return el.textContent.trim();
    } catch {}
  }
  return null;
}

function booking_extractPhone() {
  try {
    const tel = document.querySelector('a[href^="tel:"]');
    if (tel) return tel.textContent.trim() || tel.href.replace("tel:", "");
  } catch {}
  for (const sel of ['[data-testid="property-phone"]', '.hp-phone']) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) return el.textContent.trim();
    } catch {}
  }
  return null;
}

function booking_extractPropertyType() {
  try {
    const el = document.querySelector(
      '[data-testid="property-type"], .hp__hotel-type, [class*="property-type"]'
    );
    return el?.textContent.trim() || null;
  } catch {
    return null;
  }
}

// ─── Airbnb extractors ──────────────────────────────────────

/**
 * Airbnb 把資料塞在多個 <script> 標籤裡。
 * 現代 Airbnb (2024+) 主要用 niobeMinimalClientData，
 * 舊版或部分市場仍用 data-deferred-state / __NEXT_DATA__。
 */
function airbnb_extractNextData() {
  // 1. niobeMinimalClientData（現代 Airbnb SPA，2024+）
  try {
    const scripts = document.querySelectorAll('script[data-injected-niobe-data]');
    for (const s of scripts) {
      const d = JSON.parse(s.textContent);
      if (d) return { _source: "niobe", data: d };
    }
  } catch {}

  // 2. data-deferred-state（2023 前後）
  const deferredIds = [
    "data-deferred-state",
    "data-deferred-state-0",
    "data-deferred-state-1",
  ];
  for (const id of deferredIds) {
    try {
      const el = document.getElementById(id);
      if (el?.textContent) {
        const d = JSON.parse(el.textContent);
        if (d) return { _source: "deferred", data: d };
      }
    } catch {}
  }

  // 3. script[type="application/json"] with id (catch-all)
  try {
    const el = document.querySelector('script[type="application/json"][id]');
    if (el?.textContent) {
      const d = JSON.parse(el.textContent);
      if (d) return { _source: "json_id", data: d };
    }
  } catch {}

  // 4. __NEXT_DATA__ (legacy)
  try {
    if (window.__NEXT_DATA__) return { _source: "next", data: window.__NEXT_DATA__ };
  } catch {}

  tbLog.warn("airbnb_extractNextData: no data source found");
  return null;
}

/**
 * 遞迴搜尋物件樹，找第一個符合條件的值。
 * 避免深入 array of arrays 過深（maxDepth 限制）。
 */
function _deepFind(obj, predicate, maxDepth = 8, _depth = 0) {
  if (_depth > maxDepth || obj === null || typeof obj !== "object") return undefined;
  if (predicate(obj)) return obj;
  for (const val of Object.values(obj)) {
    const found = _deepFind(val, predicate, maxDepth, _depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function airbnb_extractName() {
  // h1 最可靠（Airbnb 的 h1 就是房源名稱）
  try {
    const h1 = document.querySelector('h1');
    if (h1?.textContent.trim()) return h1.textContent.trim();
  } catch {}

  // JSON-LD
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      if (data?.name) return data.name;
    } catch {}
  }

  // niobeMinimalClientData / deferred state — 找 pdpSeoTitle 或 name
  try {
    const nd = airbnb_extractNextData();
    if (nd) {
      const found = _deepFind(nd.data, (o) =>
        typeof o.pdpSeoTitle === "string" && o.pdpSeoTitle.length > 2
      );
      if (found) return found.pdpSeoTitle;

      const listing = _deepFind(nd.data, (o) =>
        typeof o.name === "string" && o.name.length > 2 &&
        (o.listing_id || o.id || o.room_type_category)
      );
      if (listing?.name) return listing.name;
    }
  } catch (e) {
    tbLog.warn("airbnb_extractName nextData failed", e.message);
  }

  tbLog.warn("airbnb_extractName: not found");
  return null;
}

function airbnb_extractGPS() {
  // 1. JSON-LD geo
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const geo = data?.geo;
      if (geo?.latitude && geo?.longitude) {
        const lat = parseFloat(geo.latitude), lng = parseFloat(geo.longitude);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
    } catch {}
  }

  // 2. niobeMinimalClientData / deferred — 找有 lat+lng 的物件
  try {
    const nd = airbnb_extractNextData();
    if (nd) {
      const coordObj = _deepFind(nd.data, (o) =>
        typeof o.lat === "number" && typeof o.lng === "number" &&
        Math.abs(o.lat) > 0.001 && Math.abs(o.lng) > 0.001
      );
      if (coordObj) return { lat: coordObj.lat, lng: coordObj.lng };

      // 也找 latitude / longitude key names
      const coordObj2 = _deepFind(nd.data, (o) =>
        typeof o.latitude === "number" && typeof o.longitude === "number" &&
        Math.abs(o.latitude) > 0.001
      );
      if (coordObj2) return { lat: coordObj2.latitude, lng: coordObj2.longitude };
    }
  } catch (e) {
    tbLog.warn("airbnb_extractGPS nextData failed", e.message);
  }

  // 3. meta og:image URL sometimes embeds coords (rare, skip)

  tbLog.warn("airbnb_extractGPS: no GPS found");
  return null;
}

function airbnb_extractAddress() {
  // JSON-LD address
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

  // niobeMinimalClientData — 找 city / localizedCityName
  try {
    const nd = airbnb_extractNextData();
    if (nd) {
      const locObj = _deepFind(nd.data, (o) =>
        typeof o.city === "string" && o.city.length > 0 &&
        (o.country || o.state || o.countryCode)
      );
      if (locObj) {
        const parts = [locObj.city, locObj.state, locObj.country].filter(Boolean);
        return parts.join(", ");
      }
    }
  } catch (e) {
    tbLog.warn("airbnb_extractAddress nextData failed", e.message);
  }

  // DOM fallback
  const selectors = [
    '[data-testid="listing-summary-location"]',
    '[data-section-id="OVERVIEW_DEFAULT"] h2',
    '[data-section-id="OVERVIEW_DEFAULT_V2"] h2',
    '[data-testid="pdp-host-title"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) return el.textContent.trim();
    } catch {}
  }

  return null;
}

function airbnb_extractPropertyType() {
  // DOM
  const selectors = [
    '[data-section-id="OVERVIEW_DEFAULT"] h2',
    '[data-section-id="OVERVIEW_DEFAULT_V2"] h2',
    '[data-testid="listing-summary-title"] span',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) return el.textContent.trim();
    } catch {}
  }

  // nextData
  try {
    const nd = airbnb_extractNextData();
    if (nd) {
      const typeObj = _deepFind(nd.data, (o) =>
        typeof o.room_type_category === "string" || typeof o.roomTypeCategory === "string"
      );
      if (typeObj) return typeObj.room_type_category || typeObj.roomTypeCategory;
    }
  } catch (e) {
    tbLog.warn("airbnb_extractPropertyType nextData failed", e.message);
  }

  return null;
}

// ─── 共用：執照號碼 ─────────────────────────────────────────

function extractLicenseNumber() {
  // 1. leaf node 精確比對「執照號碼：」
  for (const el of document.querySelectorAll('p, span, li, div')) {
    try {
      const text = el.childElementCount === 0 ? el.textContent.trim() : "";
      if (/^執照號碼[：:]/.test(text)) {
        const val = text.replace(/^執照號碼[：:]\s*/, "").trim();
        if (val) return val;
      }
    } catch {}
  }

  // 2. XPath（Booking.com 已知位置）
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

  // 3. 候選 selector + regex
  const candidates = [
    '[data-testid="property-description"]',
    '[data-section-id="DESCRIPTION_DEFAULT"]',
    '.hp-desc-highlights',
    '.hotel_description_wrapper',
    'footer',
  ];
  for (const sel of candidates) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const match = el.textContent.match(LICENSE_RE);
        if (match) return match[0];
      }
    } catch {}
  }

  // 4. 全頁 fallback
  try {
    const match = document.body.innerText.match(LICENSE_RE);
    if (match) return match[0];
  } catch {}

  return null;
}

// 等待執照號碼出現（Booking.com 此段落為動態載入，最多等 8 秒）
async function waitForLicense(maxMs = 8000, intervalMs = 800) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const license = extractLicenseNumber();
    if (license) {
      tbLog.info("waitForLicense: found", { license });
      return license;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  tbLog.warn("waitForLicense: timed out, no license found");
  return null;
}

// ─── Airbnb: 等待關鍵內容載入 ──────────────────────────────

/**
 * Airbnb 是完整 SPA，h1 出現後 GPS/JSON 資料可能還沒注入。
 * 等待 h1 + 至少一個 JSON-LD script 都存在。
 */
async function airbnb_waitForContent(maxMs = 10000, intervalMs = 600) {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const h1 = document.querySelector("h1");
    const jsonld = document.querySelector('script[type="application/ld+json"]');
    const niobeScript = document.querySelector('script[data-injected-niobe-data]');
    const deferredEl = document.getElementById("data-deferred-state") ||
                       document.getElementById("data-deferred-state-0");

    if (h1 && (jsonld || niobeScript || deferredEl)) {
      tbLog.info(`airbnb_waitForContent: ready after ${attempt} attempts`);
      return true;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  tbLog.warn("airbnb_waitForContent: timed out waiting for content");
  return false; // 繼續嘗試，用現有資料
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
    scanning:    "確認中...",
    scanningBody:"正在比對合法旅宿資料庫...",
    safe:        "合法認證",
    safMsg:      "✓ 已列於觀光署合法旅宿名冊，可安心入住。",
    unsafe:      "風險警示",
    unsafeMsg:   "⚠ 查無合法登記，請點擊圖示查看詳細風險。",
    unknown:     "未知房源",
    sub:         "訂房安全守門員",
  },
  en: {
    scanning:    "Checking...",
    scanningBody:"Verifying against Taiwan legal accommodation database...",
    safe:        "Verified Legal",
    safMsg:      "✓ Listed in Taiwan Tourism Bureau's legal accommodation registry.",
    unsafe:      "Risk Warning",
    unsafeMsg:   "⚠ Not found in legal registry. Tap the icon for details.",
    unknown:     "Unknown property",
    sub:         "Booking Safety Guard",
  },
};

function showFloat(state, hotelData, lang = "zh") {
  try {
    const shadow = getFloat();
    const card   = shadow.getElementById("card");
    const badge  = shadow.getElementById("tb-badge");
    const body   = shadow.getElementById("tb-body");
    const t      = FLOAT_I18N[lang] ?? FLOAT_I18N.en;

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
  } catch (e) {
    tbLog.error("showFloat failed", e.message);
  }
}

// ─── 掃描主流程 ─────────────────────────────────────────────

async function scanAndStore() {
  tbLog.info("scanAndStore: start", { site: SITE, url: location.pathname });

  let name, gps, address, phone, propertyType;

  try {
    if (SITE === "airbnb") {
      // 等待 SPA 渲染 h1 + JSON 資料
      await airbnb_waitForContent();
      name         = airbnb_extractName();
      gps          = airbnb_extractGPS();
      address      = airbnb_extractAddress();
      phone        = null;
      propertyType = airbnb_extractPropertyType();
    } else {
      name         = booking_extractName();
      gps          = booking_extractGPS();
      address      = booking_extractAddress();
      phone        = booking_extractPhone();
      propertyType = booking_extractPropertyType();
    }
  } catch (e) {
    tbLog.error("scanAndStore: extraction threw", e.message);
  }

  tbLog.info("scanAndStore: extracted", { name, gps, address, propertyType });

  // 不是單一房源頁面就不顯示
  if (!name && !gps) {
    tbLog.info("scanAndStore: no name/gps, skipping");
    return;
  }

  const lang = detectLang();
  tbLog.info("scanAndStore: lang detected", { lang });
  showFloat("scanning", null, lang);

  // Booking.com 的執照號碼段落為動態載入，等待最多 8 秒
  // Airbnb 通常沒有執照號碼，但仍然跑一次全頁掃描
  const license = SITE === "booking"
    ? await waitForLicense()
    : extractLicenseNumber();

  tbLog.info("scanAndStore: license", { license });

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

  chrome.storage.local.set({ taibear_hotel: payload }, () => {
    if (chrome.runtime.lastError) {
      tbLog.error("storage.set taibear_hotel failed", chrome.runtime.lastError.message);
    }
  });

  chrome.runtime.sendMessage({
    action: "checkHotel",
    data: {
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
    if (chrome.runtime.lastError) {
      tbLog.error("sendMessage checkHotel: runtime error", chrome.runtime.lastError.message);
      chrome.storage.local.set({ taibear_result: null });
      showFloat("unsafe", payload, lang);
      return;
    }
    if (response?.success) {
      tbLog.info("checkHotel response", { legal: response.data?.legal, matchedBy: response.data?.matchedBy });
      chrome.storage.local.set({ taibear_result: response.data });
      const displayData = response.data.legal
        ? { ...response.data.hotel, name: payload.name || response.data.hotel?.name }
        : payload;
      showFloat(response.data.legal ? "safe" : "unsafe", displayData, lang);
    } else {
      tbLog.warn("checkHotel response: API error", response?.error);
      chrome.storage.local.set({ taibear_result: null });
      showFloat("unsafe", payload, lang);
    }
  });
}

// ─── Message listener ───────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getHotelData") {
    chrome.storage.local.get(["taibear_hotel", "taibear_result", "taibear_logs"], (data) => {
      if (chrome.runtime.lastError) {
        tbLog.error("getHotelData storage.get failed", chrome.runtime.lastError.message);
        sendResponse({ hotel: null, result: null, logs: [] });
        return;
      }
      sendResponse({
        hotel:  data.taibear_hotel  ?? null,
        result: data.taibear_result ?? null,
        logs:   data.taibear_logs   ?? [],
      });
    });
    return true;
  }
});

// ─── 啟動 ───────────────────────────────────────────────────

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
    tbLog.info("SPA navigation detected, rescanning", { newUrl: location.pathname });
    setTimeout(scanAndStore, 1500);
  }
}).observe(document.body, { childList: true, subtree: true });
