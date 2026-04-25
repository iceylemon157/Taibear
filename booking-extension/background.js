/**
 * Taibear service worker — 轉發 API 請求，解決 content script 的 CORS 限制
 */

const API_BASE = "http://localhost:8001";

// ─── Logger ────────────────────────────────────────────────

function swLog(level, msg, data) {
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[Taibear-SW][${level.toUpperCase()}] ${msg}`, data ?? "");
}

// ─── 共用 fetch helper ──────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Message handler ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── checkHotel ──────────────────────────────────────────
  if (msg.action === "checkHotel") {
    const { name, name_en, lat, lng, licenseNumber, address, source } = msg.data ?? {};

    if (!source) {
      swLog("warn", "checkHotel: missing source field");
      sendResponse({ success: false, error: "missing source" });
      return true;
    }

    const params = new URLSearchParams();
    if (name_en) params.set("name_en", name_en);
    if (name)    params.set("name", name);
    if (lat)     params.set("lat", lat);
    if (lng)     params.set("lng", lng);
    if (licenseNumber) params.set("license_number", licenseNumber);
    if (address) params.set("address", address);
    params.set("source", source);

    swLog("info", "checkHotel →", { name, name_en, lat, lng, source });

    apiFetch(`${API_BASE}/api/check-hotel?${params}`)
      .then(data => {
        swLog("info", "checkHotel ←", { legal: data.legal, matchedBy: data.matchedBy });
        sendResponse({ success: true, data });
      })
      .catch(err => {
        swLog("error", "checkHotel fetch failed", err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // ── saveHotel ───────────────────────────────────────────
  if (msg.action === "saveHotel") {
    const { display_name, address, lat, lng, license_number, source, source_url, hotel_id } = msg.data ?? {};

    if (!display_name) {
      swLog("warn", "saveHotel: missing display_name");
      sendResponse({ success: false, error: "missing display_name" });
      return true;
    }

    swLog("info", "saveHotel →", { display_name, source, source_url: source_url?.slice(0, 60) });

    apiFetch(`${API_BASE}/api/save-hotel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name, address, lat, lng, license_number, source, source_url, hotel_id }),
    })
      .then(data => {
        swLog("info", "saveHotel ←", { id: data.id, created: data.created });
        sendResponse({ success: true, data });
      })
      .catch(err => {
        swLog("error", "saveHotel fetch failed", err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // ── 未知 action ─────────────────────────────────────────
  swLog("warn", "unknown action", msg.action);
  return false;
});
