# trip_manager

Stateful trip lifecycle manager with real-time disruption monitoring and automatic replanning.

---

## How It Works

```
route_choice_sample.json (chosen route)
        │
        ▼
  ┌─────────────┐     ┌──────────────────┐
  │ Trip Manager │◄───►│  JSON Trip Store  │   persistence
  └──────┬──────┘     └──────────────────┘
         │
         │  every 5 min (background poll)
         ▼
  ┌──────────────────┐
  │ Disruption       │◄──── RealtimeClient (weather / traffic)
  │ Detector         │
  └──────┬───────────┘
         │  alerts
         ▼
  ┌──────────────────┐
  │ Trip Planner     │  (stub) — replan remaining stops
  │ Client           │
  └──────────────────┘
```

### Trip State Machine

```
PLANNED ──activate──► ACTIVE ──complete all stops──► COMPLETED
   │                    │  ▲                             
   │                    │  │ weather improves             
   │                    ▼  │                             
   │               DISRUPTED ──replan──► REPLANNING ──► ACTIVE
   │                    │                                
   └───cancel───────────┴───────────────────────────► CANCELLED
```

### Stop State Machine

```
PENDING ──► ACTIVE ──► COMPLETED
                  └──► SKIPPED
```

When a stop is completed or skipped, the next PENDING stop is automatically set to ACTIVE.  
When all stops are done, the trip is automatically marked COMPLETED.

---

## Project Structure

```
trip_manager/
├── main.py                         # Entry point — wires dependencies, starts server on :8003
├── config.py                       # Thresholds, store backend, external service URLs
├── models/
│   ├── trip.py                     # Trip, TripStop, TripStatus, StopStatus, Location
│   └── disruption.py               # DisruptionAlert, AlertType, Severity
├── store/
│   ├── base.py                     # TripStore ABC (swap to DB without changing logic)
│   └── json_store.py               # JSON-file persistence in trips/
├── detectors/
│   └── disruption_detector.py      # Rule engine — weather & traffic thresholds
├── clients/
│   ├── trip_planner_client.py      # Stub + documented contract for Trip Planner
│   └── task_manager_client.py      # Stub + documented contract for Task Manager
├── core/
│   └── manager.py                  # Orchestrator — lifecycle, detection, replanning, polling
├── api/
│   └── routes.py                   # 9 FastAPI endpoints
└── trips/                          # Persisted trip JSON files
```

---

## Setup

### 1. Install dependencies

```powershell
pip install fastapi uvicorn requests python-dotenv
```

### 2. Start the server

```powershell
cd YTP_Hackathon
python -m trip_manager.main            # http://localhost:8003
python -m trip_manager.main --port 9000
```

Interactive docs: `http://localhost:8003/docs`

---

## Configuration (`config.py`)

| Constant | Default | Description |
|----------|---------|-------------|
| `STORE_BACKEND` | `"json"` | Persistence backend (`json` or future `db`) |
| `POLL_INTERVAL_SECS` | `300` | Background disruption check interval (5 min) |
| `RAIN_TRIGGER_PCT` | `60` | Rain probability % to trigger MEDIUM alert |
| `HEAVY_RAIN_TRIGGER_PCT` | `80` | Rain probability % to trigger HIGH alert |
| `JAM_SPEED_KMH` | `10` | Avg speed below this triggers congestion alert |
| `TRIP_PLANNER_URL` | `http://localhost:8001` | Trip Planner service base URL |
| `TASK_MANAGER_URL` | `http://localhost:8002` | Task Manager service base URL |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/trips` | Create a trip from a chosen route |
| `GET` | `/trips/{trip_id}` | Get full trip state |
| `GET` | `/users/{user_id}/trips` | List trip IDs for a user |
| `POST` | `/trips/{trip_id}/activate` | PLANNED → ACTIVE, starts background polling |
| `POST` | `/trips/{trip_id}/cancel` | Cancel a trip |
| `POST` | `/trips/{trip_id}/stops/{stop_id}/status` | Update stop status |
| `POST` | `/trips/{trip_id}/check` | Manual disruption check |
| `GET` | `/trips/{trip_id}/alerts` | Get current active alerts |
| `POST` | `/trips/{trip_id}/replan` | Trigger replanning of remaining stops |
| `GET` | `/health` | Health check |

### Example: Full trip lifecycle over HTTP

```powershell
$base = "http://localhost:8003"

# 1. Load a route from route_choice_sample.json
$routes = Get-Content route_choice_sample.json | ConvertFrom-Json
$chosenRoute = $routes.recommended_routes[0]

# 2. Create a trip
$body = @{
    user_id      = "alice"
    trip_date    = "2025-08-01"
    chosen_route = $chosenRoute
} | ConvertTo-Json -Depth 10

$trip = Invoke-RestMethod -Method Post -Uri "$base/trips" `
    -ContentType "application/json" -Body $body
$tripId  = $trip.trip_id
$stopId1 = $trip.stops[0].stop_id

# 3. Activate the trip
Invoke-RestMethod -Method Post -Uri "$base/trips/$tripId/activate"

# 4. Complete the first stop (next stop auto-activates)
$body = @{ status = "completed" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/trips/$tripId/stops/$stopId1/status" `
    -ContentType "application/json" -Body $body

# 5. Check for disruptions
Invoke-RestMethod -Method Post -Uri "$base/trips/$tripId/check"

# 6. View current alerts
Invoke-RestMethod -Uri "$base/trips/$tripId/alerts"
```

### Request / Response Shapes

**`POST /trips`** request body:

```json
{
  "user_id": "alice",
  "trip_date": "2025-08-01",
  "chosen_route": {
    "route_id": "route_A",
    "route_name": "療癒文青花園漫遊",
    "theme": "...",
    "tsp_evaluation": { "total_transit_time_mins": 79, "smoothness_score": 1.0 },
    "google_maps_url": "https://...",
    "waypoints": [
      {
        "step_order": 1,
        "name": "臺北玫瑰園",
        "place_id": "ChIJ...",
        "location": { "lat": 25.069, "lng": 121.528 },
        "suggested_time": "09:00 - 10:30",
        "reasoning": "..."
      }
    ]
  }
}
```

**Trip response** (returned by most endpoints):

```json
{
  "trip_id": "a1b2c3d4e5f6",
  "user_id": "alice",
  "trip_date": "2025-08-01",
  "status": "active",
  "route_name": "療癒文青花園漫遊",
  "theme": "...",
  "tsp_evaluation": { "total_transit_time_mins": 79, "smoothness_score": 1.0 },
  "google_maps_url": "https://...",
  "original_route_id": "route_A",
  "stops": [
    {
      "stop_id": "a1b2c3d4e5f6_stop_1",
      "step_order": 1,
      "name": "臺北玫瑰園",
      "place_id": "ChIJ...",
      "location": { "lat": 25.069, "lng": 121.528 },
      "suggested_time": "09:00 - 10:30",
      "reasoning": "...",
      "status": "active"
    }
  ],
  "active_alerts": [],
  "created_at": "2025-08-01T01:00:00+00:00",
  "updated_at": "2025-08-01T01:05:00+00:00"
}
```

---

## Integration with Other Services

### Trip Planner → Trip Manager

After the Trip Planner recommends routes, call `POST /trips` with the user's chosen route to start managing it.

### Trip Manager → Trip Planner (replanning)

When a disruption is detected, Trip Manager calls `POST {TRIP_PLANNER_URL}/replan` with:

```json
{
  "user_id": "alice",
  "trip_date": "2025-08-01",
  "remaining_stops": [ { "stop_id": "...", "name": "...", ... } ],
  "current_time": "14:30",
  "alerts": [ { "alert_type": "heavy_rain", "severity": "high", ... } ],
  "original_theme": "療癒文青花園漫遊"
}
```

The planner should return a new route in the same format as `route_choice_sample.json`.

### Trip Manager → Task Manager

Trip Manager queries `GET {TASK_MANAGER_URL}/stops/{stop_id}/completion` to check if a stop's tasks are done:

```json
{
  "stop_id": "a1b2c3d4e5f6_stop_1",
  "completed": true,
  "total_tasks": 3,
  "done_tasks": 3
}
```

---

## Running Tests

```powershell
pip install pytest httpx pytest-asyncio
cd YTP_Hackathon
python -m pytest tests/test_trip_manager_integration.py -v
```
