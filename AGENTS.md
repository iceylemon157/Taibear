# YTP Hack — Agent Guidelines

Taipei daily-trip planning system. Modular FastAPI microservices orchestrated via Docker Compose.

## Architecture

```
user_profile_manager (8004)  →  agent (8001)  →  trip_manager (8003)
                                       ↕                              ↕
                                PostgreSQL + TG Bot           realtime_monitor (library)
```

| Service | Port | Dockerfile | Notes |
|---------|------|------------|-------|
| `agent/` | 8001 (host), 8000 (internal) | `Dockerfile.agent` | Gemini ADK, TSP routing |
| `trip_manager/` | 8003 | `Dockerfile.trip-manager` | Bundles `realtime_monitor/` in same image |
| `user_profile_manager/` | 8004 | `Dockerfile.user-profile-manager` | JSON file store |
| `db` | internal only | `postgres:16` | No host port — only reachable inside `ytp` network |
| `tg-bot` | internal only | `Dockerfile.tgbot` | Telegram companion to agent |

Task Manager (port 8002) is a **stub** — `TripPlannerClient` and `TaskManagerClient` in `trip_manager/clients/` document the expected contracts.

## Build and Test

```powershell
# Start everything (first run takes a while to build)
docker compose up --build

# Health checks
curl http://localhost:8001/health   # trip-planner
curl http://localhost:8003/health   # trip-manager
curl http://localhost:8004/health   # user-profile-manager

# Run integration tests (services must be running)
.\venv\Scripts\Activate.ps1
python -m pytest tests/test_all_services.py -v -m "not slow"   # fast only
python -m pytest tests/test_all_services.py -v                 # includes Gemini calls

# Run unit/contract tests (no services needed)
python -m pytest tests/test_trip_manager_integration.py -v
```

> **First-time setup**: `cp .env.example .env` and fill in at minimum `POSTGRES_PASSWORD`, `GOOGLE_API_KEY`, `GOOGLE_MAPS_API_KEY`, `YTP_API_KEY`.

## Database Initialisation

PostgreSQL is managed automatically — no manual migration step is needed.

### What happens on `docker compose up --build`

| Order | What runs | Where |
|-------|-----------|-------|
| 1 | `Base.metadata.create_all()` | `agent/main.py` `lifespan()` — creates all tables (`hotels`, `saved_hotels`, `users`, `items`, …) via SQLAlchemy `CREATE TABLE IF NOT EXISTS` |
| 2 | `scripts/seed_demo_users.py` | Dockerfile CMD — imports `agent/db/users/*.json` demo users. Idempotent (`ON CONFLICT DO NOTHING`). |
| 3 | `python -m db.seed_hotels` | Dockerfile CMD — loads `agent/data/hotels/HotelList.json` (15 585 hotels from the Taiwan Tourism Bureau) into the `hotels` table. Skipped automatically if the table already has rows. |

### Re-seeding hotels from scratch

```bash
# Connect to the running Postgres container and truncate
docker compose exec db psql -U ytp -d ytp -c "TRUNCATE hotels CASCADE;"

# Then restart the agent — seed will run again on startup
docker compose restart trip-planner
```

### Running the seed manually (outside Docker)

```bash
cd agent
cp ../.env .env          # needs DATABASE_URL
uv sync
uv run python -m db.seed_hotels
# or with a custom JSON path:
uv run python -m db.seed_hotels --path /path/to/HotelList.json
```

### Data source

`agent/data/hotels/HotelList.json` is the raw JSON export from the
[Taiwan Tourism Bureau Open Data API](https://www.motc.gov.tw/201506260001/app/govdata_list/view?module=datagov&id=1615&serno=201712260002)
(15 585 hotels and homestays as of the last export). The file is committed to the
repository so no external download is required.

### Schema overview

```
hotels          — read-only reference table (Taiwan Tourism Bureau)
saved_hotels    — hotels bookmarked via the Chrome extension (no user login required)
users           — Telegram users
items           — saved reels / YouTube links per user
places          — extracted places from reels
item_places     — many-to-many: items ↔ places
daily_usage     — per-user LLM call counters
hidden_spots    — community-submitted hidden gems
hidden_spot_photos / hidden_spot_comments
```

## Service Conventions

### agent
- Managed by `uv` (not pip) — see `pyproject.toml`. Run `uv sync` to install.
- All endpoints except `GET /health` require `X-API-Key: <YTP_API_KEY>` header.
- Input to `POST /plan` is `SpotResult` (defined in `schemas.py`). Output is `{ "recommended_routes": [...] }` — see `spec.md` for full JSON contract.
- Gemini key rotation: GOOGLE_API_KEY → GOOGLE_API_KEY_2 → GOOGLE_API_KEY_3.
- `agent/models.py` is the **single source of truth** for `UserPreference` and `Reel` Pydantic models. `schemas.py` re-exports them.

### trip_manager
- `realtime_monitor/` is copied into the same Docker image — import it directly: `from realtime_monitor.client import RealtimeClient`.
- Trip store persists JSON files to `trips/` (volume-mounted at `/app/trip_manager/trips`).
- State machines — see `trip_manager/README.md`:
  - Trip: `PLANNED → ACTIVE → DISRUPTED ↔ REPLANNING → COMPLETED / CANCELLED`
  - Stop: `PENDING → ACTIVE → COMPLETED / SKIPPED`; completing/skipping auto-advances next stop.

### user_profile_manager
- Container `WORKDIR` is `/app/user_profile_manager`, so imports are **bare** (e.g. `from models import UserPreference`), not package-qualified.
- `models.py` is a self-contained local copy of `UserPreference` / `Reel` dataclasses. **Do not** re-introduce a dependency on `user_preference_search/`.
- Started via uvicorn factory: `uvicorn main:build_app --factory`.

### realtime_monitor
- Library only — no standalone server.
- CWA weather API key is read from the `weather_auth_code` file at project root if `CWA_API_KEY` env var is blank.
- TDX traffic fetcher raises `NotImplementedError` — it is a planned stub.

## Key Data Contracts

**SpotResult** (search output = plan input):
```json
{
  "query": "...",
  "user_preference": { "name": "...", "tags": [...], "reels": [...] },
  "top_results": [{ "rank": 1, "extracted_places": [{ "name": "...", "context": "..." }], "tags": [...] }]
}
```

**Route** (plan output, stored as chosen_route in trip_manager):
```json
{
  "route_id": "route_A", "route_name": "...", "theme": "...",
  "tsp_evaluation": { "total_transit_time_mins": 45, "smoothness_score": 0.95 },
  "google_maps_url": "https://...",
  "waypoints": [{ "step_order": 1, "name": "...", "place_id": "...", "location": { "lat": 0, "lng": 0 }, "suggested_time": "09:00 - 10:30", "reasoning": "..." }]
}
```
`Trip.from_chosen_route(user_id, trip_date, route_dict)` converts this to a `Trip` with `TripStop` objects.

## Commit Convention

```
feat:     new feature
fix:      bug fix
refactor: restructuring without behaviour change
chore:    deps / config / tooling
docs:     documentation only
test:     tests only
```
