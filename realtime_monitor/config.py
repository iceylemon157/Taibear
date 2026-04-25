"""
realtime_monitor/config.py — API credentials and endpoint configuration.

Weather: CWA (Central Weather Administration, Taiwan)
Traffic: TDX (Transport Data eXchange, Taiwan MOTC)
"""

import os

from dotenv import load_dotenv

load_dotenv()

# ── CWA Weather API ───────────────────────────────────────────────────────────
# Key can be set via env var or read from the weather_auth_code file.
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
_AUTH_CODE_PATH = os.path.join(_MODULE_DIR, "..", "weather_auth_code")


def _read_cwa_key() -> str:
    key = os.getenv("CWA_API_KEY", "")
    if key:
        return key
    if os.path.isfile(_AUTH_CODE_PATH):
        with open(_AUTH_CODE_PATH, encoding="utf-8") as f:
            return f.read().strip()
    return ""


CWA_API_KEY: str = _read_cwa_key()
CWA_BASE_URL: str = "https://opendata.cwa.gov.tw/api"
# F-D0047-061 = 臺北市未來2天天氣預報 (township-level)
CWA_FORECAST_DATASET: str = "F-D0047-061"

# ── TDX Traffic API ───────────────────────────────────────────────────────────
TDX_CLIENT_ID: str = os.getenv("TDX_CLIENT_ID", "")
TDX_CLIENT_SECRET: str = os.getenv("TDX_CLIENT_SECRET", "")
TDX_AUTH_URL: str = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
TDX_BASE_URL: str = "https://tdx.transportdata.tw/api/basic"

# ── Timeouts ──────────────────────────────────────────────────────────────────
REQUEST_TIMEOUT_SECS: int = int(os.getenv("REALTIME_TIMEOUT", "10"))
