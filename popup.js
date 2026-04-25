// ← 上線後換成部署的 API URL
const API_BASE = "http://localhost:8000";

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

function showState(state, hotelData) {
  ["state-scanning", "state-safe", "state-unsafe"].forEach(id =>
    document.getElementById(id).classList.add("hidden")
  );

  const badge = document.getElementById("badge");

  if (state === "scanning") {
    document.getElementById("state-scanning").classList.remove("hidden");
    badge.textContent = "確認中...";
    badge.className = "badge";
  } else if (state === "safe") {
    document.getElementById("state-safe").classList.remove("hidden");
    badge.textContent = "合法認證";
    badge.className = "badge safe";
    if (hotelData) {
      document.getElementById("hotel-name-safe").textContent = hotelData.name || "未知房源";
      document.getElementById("hotel-addr-safe").textContent = hotelData.address || "";
      renderChecklist(hotelData);
    }
  } else if (state === "unsafe") {
    document.getElementById("state-unsafe").classList.remove("hidden");
    badge.textContent = "風險警示";
    badge.className = "badge unsafe";
    document.getElementById("hotel-name-unsafe").textContent = hotelData?.name || "未知房源";
    document.getElementById("hotel-addr-unsafe").textContent = hotelData?.address || "";
    renderRisks(hotelData);
  }
}

function renderChecklist(hotel) {
  const checks = [
    { label: "旅館業登記證", status: hotel.licenseNumber ? "ok" : "warn" },
    { label: "消防安全設施", status: hotel.hotelClass >= 1 ? "ok" : "warn" },
    { label: "投保旅遊責任險", status: hotel.hotelClass >= 1 ? "ok" : "warn" },
    { label: "無障礙設施", status: "warn" },
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
  const risks = [];

  // 核心風險（未在觀光署名冊必定缺這些保障）
  risks.push({
    level: "high",
    text: "未經消防、衛生、建築主管機關審查，熱水器通風等安全標準無人把關",
  });
  risks.push({
    level: "high",
    text: "無強制投保公共意外險義務，旅客發生意外求償無門",
  });

  if (!hotelData?.licenseNumber) {
    risks.push({
      level: "high",
      text: "頁面未顯示登記字號，無法核實業者身份，消費糾紛難以追究",
    });
  }

  if (!hotelData?.address) {
    risks.push({
      level: "high",
      text: "無確切地址，緊急狀況（火災、一氧化碳中毒）難以通報救援",
    });
  }

  if (!hotelData?.phone) {
    risks.push({
      level: "medium",
      text: "無業者聯絡電話，改期退費爭議只能透過平台客服，流程冗長",
    });
  }

  const type = hotelData?.propertyType || "";
  if (type && /公寓|apartment|民宅|住宅/i.test(type)) {
    risks.push({
      level: "medium",
      text: "住宅型房源可能位於頂加或窄巷，阻礙逃生動線",
    });
  }

  risks.push({
    level: "low",
    text: "個資保護無相關法規約束，訂房資料外洩風險較高",
  });

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

async function checkHotel(hotelPayload) {
  const { name, lat, lng, licenseNumber, address } = hotelPayload;

  // 1. 先試 API
  try {
    const params = new URLSearchParams();
    if (name)          params.set("name", name);
    if (lat)           params.set("lat", lat);
    if (lng)           params.set("lng", lng);
    if (licenseNumber) params.set("license_number", licenseNumber);
    if (address)       params.set("address", address);

    const res    = await fetch(`${API_BASE}/api/check-hotel?${params}`);
    const result = await res.json();
    // 顯示名字用網頁上的（用戶認識的），登記資料用資料庫的
    const displayData = result.legal
      ? { ...result.hotel, name: hotelPayload.name || result.hotel?.name, address: hotelPayload.address || result.hotel?.address }
      : hotelPayload;
    showState(result.legal ? "safe" : "unsafe", displayData);
    return;
  } catch {}

  // 2. API 沒跑 → 本地 mock
  const mock = localCheck(name);
  if (mock) {
    showState(mock.legal ? "safe" : "unsafe", mock.hotel);
  } else {
    showState("unsafe", hotelPayload);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  showState("scanning");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    const isSupportedSite = tab?.url &&
      (tab.url.includes("booking.com") || tab.url.includes("airbnb.com"));

    if (!isSupportedSite) {
      setTimeout(() =>
        showState("unsafe", { name: "不支援的頁面", address: "請前往 Booking.com 或 Airbnb 使用" })
      , 600);
      return;
    }

    // 先讀 storage（content script 可能已掃好）
    chrome.storage.local.get(["taibear_hotel", "taibear_result"], async (data) => {
      const cached = data.taibear_hotel;
      const cachedResult = data.taibear_result;
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
          showState("unsafe", { name: "無法辨識此房源", address: "" });
        }
        return;
      }

      // 沒快取 → 問 content script
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: "getHotelData" }, async (res) => {
          if (res?.hotel) {
            await checkHotel(res.hotel);
          } else {
            showState("unsafe", { name: "無法辨識此房源", address: "" });
          }
        });
      }, 800);
    });
  });

  // 按鈕
  document.getElementById("btn-add").addEventListener("click", () => {
    chrome.storage.local.get("taibear_hotel", (data) => {
      const hotel = data.taibear_hotel;
      const params = new URLSearchParams();
      if (hotel?.name)    params.set("hotelName", hotel.name);
      if (hotel?.lat)     params.set("lat", hotel.lat);
      if (hotel?.lng)     params.set("lng", hotel.lng);
      if (hotel?.address) params.set("address", hotel.address);
      // ← 換成平台的網址
      chrome.tabs.create({ url: `https://taibear.app/itinerary?${params}` });
    });
  });

  document.getElementById("btn-official").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.travelweb.com.tw/" });
  });

  document.getElementById("btn-leave").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://taibear.app/search" });
  });

  document.getElementById("btn-learn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.cna.com.tw/project/20220930-illegal-bnb/" });
  });
});
