// API 請求統一透過 background service worker 轉發，解決 CORS 限制

// ─── i18n ────────────────────────────────────────────────────
const I18N = {
  zh: {
    tagline:          "訂房安全守門員",
    scanning:         "確認中...",
    scanningBody:     "正在比對合法旅宿資料庫...",
    safeBadge:        "合法認證",
    safeTitle:        "✓　這間旅宿合法有保障",
    safeDesc:         "已登記於觀光署合法旅宿名冊，可安心入住。",
    registrationInfo: "登記資訊",
    btnAdd:           "+ 加入 Taibear，以此安排行程",
    btnAddSaved:      "已收藏 ✓",
    btnOfficial:      "查看官方登記資料 →",
    unsafeBadge:      "風險警示",
    unsafeTitle:      "⚠　查無合法登記",
    unsafeDesc:       "此房源未列於觀光署合法旅宿名冊，可能為非法業者。",
    potentialRisks:   "潛在風險",
    btnLeave:         "離開此頁，找合法替代房源",
    btnLearn:         "了解非法旅宿風險 →",
    sourceText:       "資料來源：中央社報導、觀光署旅宿資料庫",
    unsupported:      "不支援的頁面",
    unsupportedAddr:  "請前往 Booking.com 或 Airbnb 使用",
    unknownProperty:  "無法辨識此房源",
    checks: {
      license:      "旅館業登記證",
      fire:         "消防安全設施",
      insurance:    "投保旅遊責任險",
      accessible:   "無障礙設施",
    },
    risks: {
      noSafety:     "未經消防、衛生、建築主管機關審查，熱水器通風等安全標準無人把關",
      noInsurance:  "無強制投保公共意外險義務，旅客發生意外求償無門",
      noLicense:    "頁面未顯示登記字號，無法核實業者身份，消費糾紛難以追究",
      noAddress:    "無確切地址，緊急狀況（火災、一氧化碳中毒）難以通報救援",
      noPhone:      "無業者聯絡電話，改期退費爭議只能透過平台客服，流程冗長",
      apartment:    "住宅型房源可能位於頂加或窄巷，阻礙逃生動線",
      privacy:      "個資保護無相關法規約束，訂房資料外洩風險較高",
    },
  },
  en: {
    tagline:          "Booking Safety Guard",
    scanning:         "Checking...",
    scanningBody:     "Verifying against Taiwan legal accommodation database...",
    safeBadge:        "Verified Legal",
    safeTitle:        "✓  This property is legally registered",
    safeDesc:         "Listed in Taiwan Tourism Bureau's legal accommodation registry. Safe to book.",
    registrationInfo: "Registration Details",
    btnAdd:           "+ Add to Taibear Itinerary",
    btnAddSaved:      "Saved ✓",
    btnOfficial:      "View Official Registry →",
    unsafeBadge:      "Risk Warning",
    unsafeTitle:      "⚠  Not Found in Legal Registry",
    unsafeDesc:       "This property is not listed in Taiwan Tourism Bureau's legal accommodation registry.",
    potentialRisks:   "Potential Risks",
    btnLeave:         "Leave & Find a Legal Alternative",
    btnLearn:         "Learn About Illegal Rental Risks →",
    sourceText:       "Source: CNA Reports, Taiwan Tourism Bureau Database",
    unsupported:      "Page not supported",
    unsupportedAddr:  "Please open a Booking.com or Airbnb listing",
    unknownProperty:  "Unable to identify this property",
    checks: {
      license:      "Hotel Registration Certificate",
      fire:         "Fire Safety Compliance",
      insurance:    "Travel Liability Insurance",
      accessible:   "Accessibility Facilities",
    },
    risks: {
      noSafety:     "Not inspected for fire, sanitation, or building safety — no regulatory oversight",
      noInsurance:  "No mandatory public liability insurance; accidents may leave you with no recourse",
      noLicense:    "No registration number shown — operator identity unverifiable, disputes hard to resolve",
      noAddress:    "No verified address — emergency services may be unable to locate you",
      noPhone:      "No operator phone — change/refund disputes require going through platform support",
      apartment:    "Residential-type listing may have obstructed evacuation routes",
      privacy:      "No legal data-protection obligations — booking data may be at higher risk of exposure",
    },
  },
};

let currentLang = "zh"; // 預設中文，從 storage 讀取後更新

function t(key) {
  return (I18N[currentLang] ?? I18N.en)[key] ?? I18N.zh[key] ?? key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text) el.textContent = text;
  });
}

// 本地 fallback mock DB（API 還沒跑時用）
const MOCK_DB = {
  "丰居旅店": {
    legal: true,
    hotel: {
      name: "丰居旅店 · 北車館",
      licenseNumber: "臺北市旅館業登記證第168號",
      address: "台北市中正區重慶南路一段60號",
      lat: 25.0478,
      lng: 121.5170,
      hotelClass: 1,
    }
  },
};

// Frontend is exposed on localhost:3000 in docker compose.
const APP_BASE_URL = "http://localhost:3000";
const APP_ROUTES = {
  plan: "/trips?mode=plan",
  hotels: "/hotels",
};

function buildAppUrl(path) {
  return `${APP_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function showState(state, hotelData) {
  ["state-scanning", "state-safe", "state-unsafe"].forEach(id =>
    document.getElementById(id).classList.add("hidden")
  );

  applyI18n();

  const badge = document.getElementById("badge");

  if (state === "scanning") {
    document.getElementById("state-scanning").classList.remove("hidden");
    badge.textContent = t("scanning");
    badge.className = "badge";
  } else if (state === "safe") {
    document.getElementById("state-safe").classList.remove("hidden");
    badge.textContent = t("safeBadge");
    badge.className = "badge safe";
    if (hotelData) {
      document.getElementById("hotel-name-safe").textContent = hotelData.name || t("unknownProperty");
      document.getElementById("hotel-addr-safe").textContent = hotelData.address || "";
      renderChecklist(hotelData);
    }
  } else if (state === "unsafe") {
    document.getElementById("state-unsafe").classList.remove("hidden");
    badge.textContent = t("unsafeBadge");
    badge.className = "badge unsafe";
    document.getElementById("hotel-name-unsafe").textContent = hotelData?.name || t("unknownProperty");
    document.getElementById("hotel-addr-unsafe").textContent = hotelData?.address || "";
    renderRisks(hotelData);
  }
}

function renderChecklist(hotel) {
  const c = (I18N[currentLang] ?? I18N.en).checks;
  const checks = [
    { label: c.license,    status: hotel.licenseNumber ? "ok" : "warn" },
    { label: c.fire,       status: hotel.hotelClass >= 1 ? "ok" : "warn" },
    { label: c.insurance,  status: hotel.hotelClass >= 1 ? "ok" : "warn" },
    { label: c.accessible, status: "warn" },
  ];
  const container = document.getElementById("checklist");
  container.innerHTML = checks.map(c => `
    <div class="check-item">
      <span class="check-icon ${c.status === "ok" ? "green" : "warn"}">${c.status === "ok" ? "✓" : "!"}</span>
      <span>${c.label}</span>
    </div>
  `).join("");
}

/**
 * 根據房源缺少的資訊，對應中央社報導的具體風險
 * hotelData = 從 booking.com 頁面抓到的原始資料
 */
function assessRisks(hotelData) {
  const r = (I18N[currentLang] ?? I18N.en).risks;
  const risks = [];

  risks.push({ level: "high",   text: r.noSafety });
  risks.push({ level: "high",   text: r.noInsurance });

  if (!hotelData?.licenseNumber) {
    risks.push({ level: "high", text: r.noLicense });
  }

  if (!hotelData?.address) {
    risks.push({ level: "high", text: r.noAddress });
  }

  if (!hotelData?.phone) {
    risks.push({ level: "medium", text: r.noPhone });
  }

  const type = hotelData?.propertyType || "";
  if (type && /公寓|apartment|民宅|住宅/i.test(type)) {
    risks.push({ level: "medium", text: r.apartment });
  }

  risks.push({ level: "low", text: r.privacy });

  return risks;
}

function renderRisks(hotelData) {
  const risks = assessRisks(hotelData);
  const container = document.getElementById("risk-list");
  container.innerHTML = risks.map(r => `
    <li class="risk-item risk-${r.level}">${r.text}</li>
  `).join("");
}

// 本地 mock fallback
function localCheck(name) {
  const found = Object.keys(MOCK_DB).find(k => name && name.includes(k));
  if (found) return MOCK_DB[found];
  return null;
}

function checkHotel(hotelPayload) {
  const { name, lat, lng, licenseNumber, address, lang, source } = hotelPayload;
  if (lang) {
    currentLang = lang === "zh" ? "zh" : "en";
    applyI18n();
  }

  // 透過 background service worker 轉發，避免 CORS
  chrome.runtime.sendMessage({
    action: "checkHotel",
    data: {
      name,
      name_en: lang !== "zh" ? name : undefined,
      lat,
      lng,
      licenseNumber,
      address,
      source: source || "booking",
    },
  }, (response) => {
    if (response?.success) {
      const result = response.data;
      const displayData = result.legal
        ? { ...result.hotel, name: hotelPayload.name || result.hotel?.name, address: hotelPayload.address || result.hotel?.address }
        : hotelPayload;
      showState(result.legal ? "safe" : "unsafe", displayData);
    } else {
      // background 無法連線或 API 掛掉 → 本地 mock fallback
      const mock = localCheck(name);
      if (mock) {
        showState(mock.legal ? "safe" : "unsafe", mock.hotel);
      } else {
        showState("unsafe", hotelPayload);
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  showState("scanning");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    const isSupportedSite = tab?.url &&
      (tab.url.includes("booking.com") || tab.url.includes("airbnb.com"));

    if (!isSupportedSite) {
      setTimeout(() =>
        showState("unsafe", { name: t("unsupported"), address: t("unsupportedAddr") })
      , 600);
      return;
    }

    // 先讀 storage（content script 可能已掃好）
    chrome.storage.local.get(["taibear_hotel", "taibear_result"], async (data) => {
      const cached = data.taibear_hotel;
      const cachedResult = data.taibear_result;

      // 從快取設定語言
      if (cached?.lang) {
        currentLang = cached.lang === "zh" ? "zh" : "en";
        applyI18n();
      }

      const fresh = cached && (Date.now() - cached.scannedAt) < 30000; // 30秒內算新鮮

      if (fresh && cachedResult !== undefined) {
        // 直接用快取結果，名字用頁面抓到的（用戶認識的）
        if (cachedResult) {
          const displayData = cachedResult.legal
            ? { ...cachedResult.hotel, name: cached?.name || cachedResult.hotel?.name, address: cached?.address || cachedResult.hotel?.address }
            : cached;
          showState(cachedResult.legal ? "safe" : "unsafe", displayData);
        } else if (cached.name) {
          await checkHotel(cached);
        } else {
          showState("unsafe", { name: t("unknownProperty"), address: "" });
        }
        return;
      }

      // 沒快取 → 問 content script
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: "getHotelData" }, async (res) => {
          if (res?.hotel) {
            if (res.hotel.lang) {
              currentLang = res.hotel.lang === "zh" ? "zh" : "en";
              applyI18n();
            }
            await checkHotel(res.hotel);
          } else {
            showState("unsafe", { name: t("unknownProperty"), address: "" });
          }
        });
      }, 800);
    });
  });

  // 按鈕
  document.getElementById("btn-add").addEventListener("click", () => {
    const btn = document.getElementById("btn-add");
    btn.disabled = true;
    btn.textContent = "...";

    chrome.storage.local.get(["taibear_hotel", "taibear_result"], (data) => {
      const hotel  = data.taibear_hotel;
      const result = data.taibear_result;

      if (!hotel) {
        btn.disabled = false;
        btn.textContent = t("btnAdd");
        return;
      }

      // hotel_id 只有在合法旅宿才有（來自 check-hotel 回傳）
      const hotel_id = result?.legal ? (result.hotel?.hotel_id ?? null) : null;

      chrome.runtime.sendMessage({
        action: "saveHotel",
        data: {
          display_name:   hotel.name,
          address:        hotel.address  ?? null,
          lat:            hotel.lat      ?? null,
          lng:            hotel.lng      ?? null,
          license_number: hotel.licenseNumber ?? null,
          source:         hotel.source   ?? "booking",
          source_url:     hotel.source_url ?? null,
          hotel_id,
        },
      }, (response) => {
        if (response?.success) {
          btn.textContent = t("btnAddSaved");
          btn.classList.add("saved");

          const planUrl = new URL(buildAppUrl(APP_ROUTES.plan));
          if (response?.data?.id !== undefined && response?.data?.id !== null) {
            planUrl.searchParams.set("savedHotelId", String(response.data.id));
          }
          planUrl.searchParams.set("source", "booking-extension");
          chrome.tabs.create({ url: planUrl.toString() });
        } else {
          btn.disabled = false;
          btn.textContent = t("btnAdd");
        }
      });
    });
  });

  document.getElementById("btn-official").addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://www.motc.gov.tw/201506260001/app/govdata_list/view?module=datagov&id=1615&serno=201712260002",
    });
  });

  document.getElementById("btn-leave").addEventListener("click", () => {
    const hotelsUrl = new URL(buildAppUrl(APP_ROUTES.hotels));
    hotelsUrl.searchParams.set("source", "booking-extension");
    chrome.tabs.create({ url: hotelsUrl.toString() });
  });

  document.getElementById("btn-learn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.cna.com.tw/project/20220930-illegal-bnb/" });
  });
});
