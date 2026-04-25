# Taibear — 台北智慧旅遊系統

A modular microservices system for personalised travel planning in Taipei: preference-based spot search, AI-powered route planning, real-time disruption monitoring, and trip lifecycle management.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (TBD)                            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  user_profile    │  │     agent/       │  │  trip_manager/   │
│  _manager        │  │  (port 8001)     │  │  (port 8003)     │
│  (port 8004)     │  │                  │  │                  │
│  UserPreference  │─►│  Gemini ADK      │─►│  trip lifecycle  │
│  CRUD            │  │  /search         │  │  disruption      │
│  JSON | DB       │  │  /plan           │  │  replanning      │
└────────┬─────────┘  │  /enrich         │  └────────┬─────────┘
         │            └──────┬───────────┘           │
         │                   │                       │
         ▼                   ▼                       ▼
┌────────────────────────────────────┐  ┌──────────────────────┐
│         PostgreSQL (port 5432)     │  │  realtime_monitor/   │
│  users · items · places            │  │  (library)           │
│  item_places · daily_usage         │  │  CWA weather         │
└────────────────────────────────────┘  │  TDX traffic (stub)  │
                                        └──────────────────────┘
```

### Data flows

1. User submits preferences → `user_profile_manager` stores profile (JSON or DB)
2. Profile + query → `agent` runs Gemini ADK pipeline → returns 3 ranked routes
3. Chosen route → `trip_manager` creates a managed trip (JSON store)
4. `realtime_monitor` polls CWA / TDX → `trip_manager` detects disruptions → calls `agent /plan` to replan

---

## Modules

| Module | Port | Description |
|--------|------|-------------|
| [`agent/`](agent/) | 8001 | Gemini 2.5 Flash + Google ADK; `/search`, `/plan`, `/enrich` |
| [`trip_manager/`](trip_manager/) | 8003 | Stateful trip lifecycle; disruption detection; replanning |
| [`user_profile_manager/`](user_profile_manager/) | 8004 | UserPreference CRUD; JSON or Postgres backend |
| [`realtime_monitor/`](realtime_monitor/) | — (library) | CWA weather fetcher; TDX traffic stub |
| [`frontend/`](frontend/) | 3000 | React + Vite app (WIP) |

---

## Database

### Engine

PostgreSQL 16, managed by Docker Compose (`db` service). All services that need persistence connect via `DATABASE_URL`.

### Schema (`agent/db/models.py`)

```
users
  id          BIGINT PK        -- Telegram user_id
  username    VARCHAR(255)
  created_at  TIMESTAMPTZ

items                          -- scraped content (IG reels, YouTube, etc.)
  id          SERIAL PK
  user_id     BIGINT FK→users
  platform    VARCHAR(20)      -- "instagram" | "youtube" | ...
  url         TEXT UNIQUE
  title       TEXT
  raw_metadata JSONB
  created_at  TIMESTAMPTZ

places                         -- extracted spots from items
  id          SERIAL PK
  store_name  VARCHAR(255)
  domain      VARCHAR(20)      -- "taipei" etc.
  location    VARCHAR(50)
  category    VARCHAR(50)
  vibe        VARCHAR(50)[]    -- ARRAY of vibe tags
  address     VARCHAR(500)
  description TEXT             -- LLM-generated summary
  created_at  TIMESTAMPTZ

item_places                    -- many-to-many: items ↔ places
  item_id     INT FK→items  (CASCADE DELETE)
  place_id    INT FK→places
  PK(item_id, place_id)

daily_usage                    -- rate-limit counters
  user_id     BIGINT           -- 0 = global bot-level
  date        DATE
  llm_calls   INT
  other_calls INT
  PK(user_id, date)
```

### User preferences (`user_profile_manager`)

Stored either as **JSON files** (`user_profile_manager/users/<user_id>.json`) or in **Postgres** (controlled by `PROFILE_REPO_BACKEND` env var).

```json
{
  "user_id": "alice",
  "display_name": "Alice",
  "country": "TW",
  "preferred_languages": ["zh-TW"],
  "age": 28,
  "preferred_transportation": ["MRT", "walking"],
  "selected_tags": ["文青", "咖啡廳", "展覽"],
  "reels": [
    { "url": "https://...", "text_content": "...", "auto_tags": ["老屋", "手沖"] }
  ]
}
```

### Trip data (`trip_manager`)

Trips are persisted as JSON in `trip_manager/trips/<trip_id>.json`. No SQL table — the service is stateless between restarts except for the volume-mounted trips directory.

---

## Quick Start (Docker)

```bash
# 1. Copy and fill in secrets
cp .env.example .env
# Required: POSTGRES_PASSWORD, GOOGLE_API_KEY, GOOGLE_MAPS_API_KEY, YTP_API_KEY

# 2. Start all services
docker compose up --build

# 3. Health checks
curl http://localhost:8001/health   # agent
curl http://localhost:8003/health   # trip_manager
curl http://localhost:8004/health   # user_profile_manager
```

### Service URLs

| Service | URL |
|---------|-----|
| Agent (trip planner) | http://localhost:8001 |
| Agent Swagger UI | http://localhost:8001/docs |
| Trip Manager | http://localhost:8003 |
| User Profile Manager | http://localhost:8004 |

---

## Quick Start (Local dev)

```bash
# Agent
cd agent
uv sync
cp .env.example .env   # fill in GOOGLE_API_KEY, GOOGLE_MAPS_API_KEY, DATABASE_URL
uv run uvicorn main:app --reload --port 8001

# Trip Manager (from repo root)
python -m trip_manager.main

# User Profile Manager (from repo root)
python -m user_profile_manager.main
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Used by | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | all | Postgres password (required) |
| `POSTGRES_DB` | all | Database name (default: `ytp`) |
| `GOOGLE_API_KEY` | agent | Gemini API key |
| `GOOGLE_MAPS_API_KEY` | agent | Places API + Distance Matrix |
| `YTP_API_KEY` | agent, trip_manager | Internal service auth key |
| `CWA_API_KEY` | realtime_monitor | Central Weather Administration |
| `TDX_CLIENT_ID/SECRET` | realtime_monitor | TDX traffic API |
| `PROFILE_REPO_BACKEND` | user_profile_manager | `json` (default) or `db` |

---

## Supporting Tools

| File | Description |
|------|-------------|
| `gmap_scraper.py` | Google Maps place/search data scraper |
| `route_choice_sample.json` | Sample agent output (3 recommended routes) |
