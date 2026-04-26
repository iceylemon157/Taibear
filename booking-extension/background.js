/**
 * Taibear service worker — 轉發 API 請求，解決 content script 的 CORS 限制
 */

const API_TARGETS = [
  {
    name: "public-app",
    baseUrl: "http://20.18.161.44:3000",
    prefix: "/api/bff/agent",
  },
  {
    name: "local-agent",
    baseUrl: "http://localhost:8001",
    prefix: "",
  },
];

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

function isConnectionError(error) {
  const message = String(error?.message || "");
  if (error instanceof TypeError) return true;
  return /failed to fetch|networkerror|err_connection|load failed/i.test(message);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureLeadingSlash(value) {
  const text = String(value || "");
  return text.startsWith("/") ? text : `/${text}`;
}

function buildTargetUrl(target, pathWithQuery) {
  const base = trimTrailingSlash(target.baseUrl);
  const prefix = trimTrailingSlash(target.prefix || "");
  const path = ensureLeadingSlash(pathWithQuery);
  return `${base}${prefix}${path}`;
}

async function apiFetchWithFallback(pathWithQuery, options = {}) {
  let lastError = null;

  for (let i = 0; i < API_TARGETS.length; i += 1) {
    const target = API_TARGETS[i];
    const url = buildTargetUrl(target, pathWithQuery);

    try {
      const data = await apiFetch(url, options);
      swLog("info", "apiFetch success", { target: target.name, url });
      return data;
    } catch (error) {
      lastError = error;
      const isLastTarget = i === API_TARGETS.length - 1;
      const canFallback = !isLastTarget && isConnectionError(error);

      swLog("warn", "apiFetch failed", {
        target: target.name,
        url,
        error: String(error?.message || error),
        canFallback,
      });

      if (!canFallback) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No API target available");
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

    apiFetchWithFallback(`/api/check-hotel?${params}`)
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

    apiFetchWithFallback("/api/save-hotel", {
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
