# YTP Hackathon — 台北智慧旅遊系統

A modular microservices system for personalised travel planning in Taipei, featuring preference-based search, real-time weather monitoring, trip lifecycle management, and disruption-aware replanning.

---

## Architecture Overview

```
┌─────────────────────────┐
│  user_profile_manager   │  CRUD user preference profiles
│  (port 8004)            │
└──────────┬──────────────┘
           │ user preferences
           ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  agent    │◄───►│   PostgreSQL + TG Bot   │
│  (port 8001)            │     │  user prefs via Telegram│
│  /search /plan /enrich  │     └─────────────────────────┘
└──────────┬──────────────┘
           │ recommended routes
           ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     trip_manager        │◄───►│   realtime_monitor      │
│  (port 8003)            │     │  CWA weather / TDX stub │
│  lifecycle, disruption, │     └─────────────────────────┘
│  replanning             │
└──────────┬──────────────┘
           │ POST /plan (replan on disruption)
           ▼
┌─────────────────────────┐
│   Task Manager (stub)   │  Per-stop task tracking
│  (port 8002)            │
└─────────────────────────┘
```

### Supporting Tools

| Tool | Description |
|------|-------------|
| `gmap_scraper.py` | Google Maps place/search data scraper |
| `route_choice_sample.json` | Sample Trip Planner output (3 recommended routes) |

---

## Modules

| Module | Port | Status | Description |
|--------|------|--------|-------------|
| [`agent/`](agent/) | 8001 | ✅ Live | Gemini-powered search + route planner + enricher (search → plan → enrich) |
| [`trip_manager/`](trip_manager/) | 8003 | ✅ Live | Stateful trip lifecycle, disruption detection, replanning |
| [`user_profile_manager/`](user_profile_manager/) | 8004 | ✅ Live | CRUD for per-user preference profiles |
| [`realtime_monitor/`](realtime_monitor/) | — (library) | ✅ Live | CWA weather fetcher; TDX traffic stub |
| Task Manager | 8002 | 🔲 Stub | Per-stop task completion tracking |

---

## Quick Start (Docker)

The fastest way to bring up the entire system:

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD, GOOGLE_API_KEY, GOOGLE_MAPS_API_KEY, YTP_API_KEY

# 2. Start all services
docker compose up --build

# 3. Verify all services are healthy
curl http://localhost:8001/health   # trip_planner (agent)
curl http://localhost:8003/health   # trip_manager
curl http://localhost:8004/health   # user_profile_manager
```

### Service URLs

| Service | URL |
|---------|-----|
| Trip Planner (agent) | http://localhost:8001 |
| Trip Manager | http://localhost:8003 |
| User Profile Manager | http://localhost:8004 |
| Trip Planner Swagger UI | http://localhost:8001/docs |

---

## Quick Start (Manual)

### 1. Environment setup

```powershell
cd YTP_Hackathon
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install fastapi uvicorn requests python-dotenv duckduckgo-search sentence-transformers beautifulsoup4 openai googlemaps
```

### 2. Configuration

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-...
TDX_CLIENT_ID=...
TDX_CLIENT_SECRET=...
```

The CWA weather API key is stored in the `weather_auth_code` file (already present).

### 3. Start services

```powershell
# Terminal 1 — User Preference Search
python -m user_preference_search.api

# Terminal 2 — Trip Manager (includes realtime_monitor)
python -m trip_manager.main

# Terminal 3 — User Profile Manager
python -m user_profile_manager.main
```

### 4. Typical workflow

```powershell
# 1. Search for travel spots based on user preferences
$body = @{ user_id="alice"; query="台北文青咖啡"; provider="openai" } | ConvertTo-Json
$results = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/search" `
    -ContentType "application/json" -Body $body

# 2. (Trip Planner generates routes — use route_choice_sample.json as example)
$routes = Get-Content route_choice_sample.json | ConvertFrom-Json

# 3. Create a managed trip from the chosen route
$body = @{
    user_id = "alice"; trip_date = "2025-08-01"
    chosen_route = $routes.recommended_routes[0]
} | ConvertTo-Json -Depth 10
$trip = Invoke-RestMethod -Method Post -Uri "http://localhost:8003/trips" `
    -ContentType "application/json" -Body $body

# 4. Activate the trip (starts background weather monitoring)
Invoke-RestMethod -Method Post -Uri "http://localhost:8003/trips/$($trip.trip_id)/activate"

# 5. Progress through stops
$body = @{ status = "completed" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
    -Uri "http://localhost:8003/trips/$($trip.trip_id)/stops/$($trip.stops[0].stop_id)/status" `
    -ContentType "application/json" -Body $body
```

---

## Google Maps Scraper (`gmap_scraper.py`)

```powershell
pip install googlemaps

# Search by place name
python gmap_scraper.py place --name "臺北市立美術館"
python gmap_scraper.py place --name "臺北玫瑰園"
python gmap_scraper.py search --keyword "餐酒"
python gmap_scraper.py search --keyword "餐廳"
python gmap_scraper.py search --keyword "咖啡廳"
```