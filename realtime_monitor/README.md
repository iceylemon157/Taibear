# realtime_monitor

Standalone, reusable module for fetching real-time weather and transit data for Taipei.
Used by `trip_manager` for disruption detection, but can be imported independently by any service.

---

## How It Works

```
            RealtimeClient  (facade)
      ┌──────────┬──────────┬──────────┐
      ▼          ▼          ▼          ▼
WeatherFetcher MRTFetcher BusFetcher UBikeFetcher
  (CWA API)        (TDX API — Transport Data eXchange)
                        │
                   TDXAuth (shared OAuth2 token cache)
```

### Data Flow (all fetchers)

1. Caller provides `(lat, lng)` coordinates
2. **Weather**: maps to closest Taipei district → CWA 2-day forecast → `WeatherData`
3. **MRT**: spatial query for nearest TRTC stations → live board ETAs → `list[MRTData]`
4. **Bus**: spatial query for nearest Taipei city bus stops → ETAs per route → `list[BusData]`
5. **UBike**: spatial query for nearest YouBike 2.0 stations → live availability → `list[UBikeData]`

MRT/Bus/UBike are each two-step TDX calls because the live-data endpoints do not support
spatial filtering directly.

---

## Project Structure

```
realtime_monitor/
├── client.py                  # RealtimeClient facade — main entry point
├── config.py                  # API keys, endpoints, radius, timeouts
├── models.py                  # WeatherData, MRTData, BusData, UBikeData dataclasses
└── fetchers/
    ├── base.py                # DataFetcher ABC
    ├── tdx_auth.py            # TDX OAuth2 client-credentials with token caching
    ├── weather.py             # CWA weather fetcher
    ├── mrt.py                 # TRTC MRT live arrivals
    ├── bus.py                 # Taipei city bus ETAs
    └── ubike.py               # YouBike 2.0 availability
```

---

## Setup

### 1. Install dependencies

```bash
pip install requests python-dotenv
```

### 2. Configure credentials

All keys are read from a `.env` file in the project root (or from environment variables):

```env
# CWA weather API — leave blank to auto-read from weather_auth_code file
CWA_API_KEY=CWA-XXXX-XXXX

# TDX transit API (required for MRT, Bus, UBike)
TDX_CLIENT_ID=your_client_id
TDX_CLIENT_SECRET=your_client_secret
```

The CWA key can alternatively be placed in a file named `weather_auth_code` in the project root.

---

## Usage

### As a library

```python
from realtime_monitor.client import RealtimeClient

client = RealtimeClient()

# ── Weather ───────────────────────────────────────────────────────────────────
weather = client.get_weather(lat=25.0339, lng=121.5645)
print(weather.district)          # e.g. "信義區"
print(weather.rain_prob_pct)     # e.g. 60
print(weather.description)       # e.g. "陰短暫陣雨"
print(weather.temperature_low)   # e.g. 25
print(weather.temperature_high)  # e.g. 32
print(weather.comfort)           # e.g. "悶熱"

# ── MRT ───────────────────────────────────────────────────────────────────────
mrt_arrivals = client.get_mrt(lat=25.0478, lng=121.5170)
for arrival in mrt_arrivals:
    print(f"{arrival.station_name} [{arrival.line_id}] {arrival.direction} "
          f"→ {arrival.destination}  ETA {arrival.eta_mins} min  ({arrival.distance_m} m)")

# ── Bus ───────────────────────────────────────────────────────────────────────
bus_arrivals = client.get_bus(lat=25.0478, lng=121.5170)
for bus in bus_arrivals:
    print(f"{bus.stop_name}  Route {bus.route_name}  ETA {bus.eta_mins} min  ({bus.distance_m} m)")

# ── YouBike ───────────────────────────────────────────────────────────────────
ubike_stations = client.get_ubike(lat=25.0478, lng=121.5170)
for station in ubike_stations:
    print(f"{station.station_name}  bikes={station.available_bikes}  "
          f"docks={station.available_docks}  {station.maps_url}")
```

### Lower-level: fetchers directly

```python
from realtime_monitor.fetchers.weather import WeatherFetcher

fetcher = WeatherFetcher()
raw = fetcher.fetch(lat=25.06, lng=121.52)
for p in WeatherFetcher.parse(raw):
    print(f"{p['district']} {p['forecast_start']}~{p['forecast_end']}: "
          f"rain {p['rain_prob_pct']}%, {p['description']}")
```

---

## Running the API tests

```bash
cd Taibear-full
pip install pytest requests python-dotenv
pytest tests/test_realtime_monitor.py -v
```

The tests make live calls to CWA and TDX. A 5-second gap is inserted between TDX calls
to stay within the free-tier rate limit.

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

### `MRTData`

| Field | Type | Example |
|-------|------|---------|
| `station_name` | str | `"台北車站"` |
| `line_id` | str | `"BL"` |
| `line_name` | str | `"板南線"` |
| `direction` | str | `"往南港展覽館"` |
| `destination` | str | `"南港展覽館"` |
| `eta_mins` | int | `3` (0 = train at/just left station) |
| `distance_m` | float | `180.0` |

### `BusData`

| Field | Type | Example |
|-------|------|---------|
| `stop_name` | str | `"臺北車站(忠孝)"` |
| `route_name` | str | `"299"` |
| `direction` | int | `0` (0=outbound, 1=inbound) |
| `eta_mins` | int | `9` (-1 = no data) |
| `stop_status` | int | `0` (0=normal, 1=not-departed, 2=no-data, 3=terminal, 4=detour) |
| `distance_m` | float | `95.0` |

### `UBikeData`

| Field | Type | Example |
|-------|------|---------|
| `station_uid` | str | `"TPE500103037"` |
| `station_name` | str | `"YouBike2.0_太原廣場"` |
| `lat` | float | `25.04925` |
| `lng` | float | `121.51468` |
| `address` | str | `"鄭州路23號(旁)"` |
| `maps_url` | str | `"https://www.google.com/maps?q=25.04925,121.51468"` |
| `distance_m` | float | `312.0` |
| `available_bikes` | int | `18` |
| `available_electric_bikes` | int | `0` |
| `available_docks` | int | `11` |
| `capacity` | int | `31` |
| `service_status` | int | `1` (1=in service, 0=not in service) |

---

## Configuration (`config.py`)

| Constant | Source | Description |
|----------|--------|-------------|
| `CWA_API_KEY` | `weather_auth_code` file or `CWA_API_KEY` env | CWA open data API key |
| `CWA_BASE_URL` | hardcoded | `https://opendata.cwa.gov.tw/api` |
| `CWA_FORECAST_DATASET` | hardcoded | `F-D0047-061` (Taipei 2-day forecast) |
| `TDX_CLIENT_ID` | `.env` | TDX API client ID |
| `TDX_CLIENT_SECRET` | `.env` | TDX API client secret |
| `TDX_AUTH_URL` | hardcoded | TDX OAuth2 token endpoint |
| `TDX_BASE_URL` | hardcoded | `https://tdx.transportdata.tw/api/basic` |
| `REQUEST_TIMEOUT_SECS` | `REALTIME_TIMEOUT` env or `10` | HTTP request timeout |
| `NEARBY_RADIUS_M` | `NEARBY_RADIUS_M` env or `500` | Spatial search radius in metres |

---

## Supported Taipei Districts (weather)

The weather fetcher maps coordinates to these 12 districts:

中正區, 大同區, 中山區, 松山區, 大安區, 萬華區, 信義區, 士林區, 北投區, 內湖區, 南港區, 文山區
