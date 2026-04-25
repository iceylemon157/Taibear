"""
config.py — 專案唯一設定檔

取代 search/config.py 與各模組散落的 os.getenv 呼叫。
所有設定從這裡讀取，方便集中管理與測試替換。
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ── Paths ──────────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).parent

# 使用者偏好資料（原 search/users/，改為 db/users/ 以利未來接 DB）
DB_DIR = ROOT_DIR / "db"
USERS_DIR = DB_DIR / "users"

# Enrichment 輸出（照片、評論、字幕）
DATA_DIR = ROOT_DIR / "data"
ROUTES_DIR = DATA_DIR / "routes"
HIDDEN_SPOTS_DIR = DATA_DIR / "hidden_spots"

# ── Gemini ─────────────────────────────────────────────────────────────────────

# Multiple API keys for free-tier quota rotation (empty values filtered out)
GOOGLE_API_KEYS: list[str] = [
    k
    for k in [
        os.getenv("GOOGLE_API_KEY", ""),
        os.getenv("GOOGLE_API_KEY_2", ""),
        os.getenv("GOOGLE_API_KEY_3", ""),
    ]
    if k
]

# Backward-compat alias — ADK and any direct callers still use this
GOOGLE_API_KEY: str = GOOGLE_API_KEYS[0] if GOOGLE_API_KEYS else ""

# Per-use-case model fallback chains (tried in order)
MODELS: dict[str, list[str]] = {
    "search":  ["gemini-2.5-flash", "gemini-3.1-flash-lite-preview"],
    "planner": ["gemini-2.5-flash", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview"],
    "caption": ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview"],
    "tag":     ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview"],
}

# ── Google Maps Platform ───────────────────────────────────────────────────────

GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")

# ── API Auth ───────────────────────────────────────────────────────────────────

YTP_API_KEY: str = os.getenv("YTP_API_KEY", "")

# User Profile Manager base URL (used to resolve user preference for /search
# when local JSON profile files are not present).
USER_PROFILE_API_URL: str = os.getenv("USER_PROFILE_API_URL", "http://localhost:8004")

# ── Search Pipeline ────────────────────────────────────────────────────────────

# Gemini Search Grounding 一次萃取的景點數量上限
SEARCH_PLACES_TOP_K: int = 10
