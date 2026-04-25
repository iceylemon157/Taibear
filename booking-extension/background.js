/**
 * Taibear service worker — 轉發 API 請求，解決 CORS 問題
 */

const API_BASE = "http://localhost:8001";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "checkHotel") {
    const { name, name_en, lat, lng, licenseNumber, address, source } = msg.data;
    const params = new URLSearchParams();
    // 英文頁面時優先送 name_en；後端會先比對 name_en 欄位
    if (name_en) params.set("name_en", name_en);
    if (name)    params.set("name", name);
    if (lat) params.set("lat", lat);
    if (lng) params.set("lng", lng);
    if (licenseNumber) params.set("license_number", licenseNumber);
    if (address) params.set("address", address);
    params.set("source", source);

    fetch(`${API_BASE}/api/check-hotel?${params}`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 表示非同步回應
  }

  if (msg.action === "saveHotel") {
    const { display_name, address, lat, lng, license_number, source, source_url, hotel_id } = msg.data;
    fetch(`${API_BASE}/api/save-hotel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name, address, lat, lng, license_number, source, source_url, hotel_id }),
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});