# realtime_monitor

Standalone, reusable module for fetching real-time weather and traffic data. Used by `trip_manager` for disruption detection, but can be imported independently by any service.

---

## How It Works

```
     RealtimeClient  (facade)
      ┌──────┴──────┐
      ▼              ▼
WeatherFetcher   TrafficFetcher
  (CWA API)       (TDX API — stub)
      │
      ▼
  lat/lng → closest Taipei district → CWA 2-day forecast → WeatherData
```

### Weather Data Flow

1. Caller provides `(lat, lng)` coordinates
2. `WeatherFetcher` maps them to the closest Taipei district (12 districts)
3. Fetches the CWA F-D0047-061 dataset (臺北市未來2天天氣預報)
4. Parses Chinese element names (`3小時降雨機率`, `天氣現象`, `溫度`, `舒適度指數`) into structured forecast periods
5. Returns the `WeatherData` for the period covering the current time

---

## Project Structure

```
realtime_monitor/
├── client.py                  # RealtimeClient facade — main entry point
├── config.py                  # API keys, endpoints, timeouts
├── models.py                  # WeatherData, TrafficData dataclasses
└── fetchers/
    ├── base.py                # DataFetcher ABC
    ├── weather.py             # CWA weather fetcher (live)
    └── traffic.py             # TDX traffic fetcher (stub)
```

---

## Setup

### 1. Install dependencies

```powershell
pip install requests python-dotenv
```

### 2. Configure API key

The CWA API key is read from a file named `weather_auth_code` in the project root, or from the `CWA_API_KEY` environment variable.

```powershell
# Option A: auth file (already present)
# weather_auth_code contains the key on the first line

# Option B: environment variable
$env:CWA_API_KEY = "CWA-XXXX-XXXX"
```

### 3. (Optional) TDX credentials

Traffic fetching is stubbed. When implemented, set:

```env
TDX_CLIENT_ID=your_client_id
TDX_CLIENT_SECRET=your_client_secret
```

---

## Usage

### As a library

```python
from realtime_monitor.client import RealtimeClient

client = RealtimeClient()

# Fetch weather for a location in Taipei
weather = client.get_weather(lat=25.0339, lng=121.5645)
print(weather.district)         # e.g. "信義區"
print(weather.rain_prob_pct)    # e.g. 60
print(weather.description)      # e.g. "陰短暫陣雨"
print(weather.temperature_low)  # e.g. 25
print(weather.temperature_high) # e.g. 32
print(weather.comfort)          # e.g. "悶熱"

# Traffic (raises NotImplementedError until TDX is wired)
try:
    traffic = client.get_traffic(lat=25.0339, lng=121.5645)
except NotImplementedError:
    print("TDX not implemented yet")
```

### Lower-level: `WeatherFetcher` directly

```python
from realtime_monitor.fetchers.weather import WeatherFetcher

fetcher = WeatherFetcher()                # uses key from config
raw = fetcher.fetch(lat=25.06, lng=121.52)
periods = WeatherFetcher.parse(raw)

for p in periods:
    print(f"{p['district']} {p['forecast_start']}~{p['forecast_end']}: "
          f"rain {p['rain_prob_pct']}%, {p['description']}")
```

---

## Data Models

### `WeatherData`

| Field | Type | Example |
|-------|------|---------|
| `district` | str | `"中山區"` |
| `rain_prob_pct` | int | `60` |
| `description` | str | `"陰短暫陣雨"` |
| `temperature_low` | int | `25` |
| `temperature_high` | int | `32` |
| `comfort` | str | `"悶熱"` |
| `forecast_start` | str | `"2025-07-28T06:00:00+08:00"` |
| `forecast_end` | str | `"2025-07-28T18:00:00+08:00"` |

### `TrafficData` (future)

| Field | Type | Example |
|-------|------|---------|
| `road_name` | str | `"忠孝東路"` |
| `avg_speed_kmh` | float | `8.5` |
| `congestion_level` | str | `"congested"` |
| `travel_time_mins` | float | `25.0` |

---

## Configuration (`config.py`)

| Constant | Source | Description |
|----------|--------|-------------|
| `CWA_API_KEY` | `weather_auth_code` file or `CWA_API_KEY` env | CWA open data API key |
| `CWA_BASE_URL` | hardcoded | `https://opendata.cwa.gov.tw/api` |
| `CWA_FORECAST_DATASET` | hardcoded | `F-D0047-061` (Taipei 2-day forecast) |
| `TDX_CLIENT_ID` | `.env` | TDX API client ID |
| `TDX_CLIENT_SECRET` | `.env` | TDX API client secret |
| `REQUEST_TIMEOUT_SECS` | hardcoded | `10` seconds |

---

## Supported Taipei Districts

The weather fetcher maps coordinates to these 12 districts:

中正區, 大同區, 中山區, 松山區, 大安區, 萬華區, 信義區, 士林區, 北投區, 內湖區, 南港區, 文山區
