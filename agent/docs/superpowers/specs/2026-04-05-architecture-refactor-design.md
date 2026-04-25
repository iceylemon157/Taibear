# YTP Planning Agent — Architecture Refactor Design

**Date:** 2026-04-05  
**Scope:** Bug fixes + model consolidation + API restructure

---

## Goals

1. **Fix 3 bugs** that could cause test failures
2. **Single source of truth for models** — eliminate duplication between `agent/models.py` (dataclasses) and `schemas.py` (Pydantic)
3. **Cleaner API** — split `/search-and-plan` into `/search` + `/plan` for easier debugging and independent testing

---

## Architecture Overview

```
                    API Layer (main.py)
        /health  /search  /plan  /enrich
                     ↓       ↓      ↓
        schemas.py — all API Pydantic models
              ↑ import UserPreference, Reel
        agent/models.py — UserPreference, Reel (Pydantic, single truth)

        agent/search_pipeline.py
              → agent/preprocessor.py
                     → agent/planner.py
                     → agent/enricher.py
```

---

## Bug Fixes

### Bug 1 — `_parse_agent_response` strips `location` (planner.py:187-190)

**Problem:** Builds `wp_for_url` without `location`, so `build_google_maps_url` always falls back to URL-encoded names instead of coordinates.

**Fix:** Pass `waypoints` directly to `build_google_maps_url` — the function already handles both `{lat, lng}` and `{location: {lat, lng}}` formats.

```python
# Before
wp_for_url = [{"name": wp["name"], "place_id": wp.get("place_id", "")} for wp in waypoints]
route["google_maps_url"] = build_google_maps_url(wp_for_url)

# After
route["google_maps_url"] = build_google_maps_url(waypoints)
```

### Bug 2 — `asyncio.get_event_loop()` deprecated (main.py:116, 150)

**Fix:** Replace with `asyncio.get_running_loop()` in all async endpoint handlers.

### Bug 3 — `json.loads` no fallback in `_parse_agent_response` (planner.py:181)

**Problem:** If LLM includes surrounding text, bare `json.loads()` raises `JSONDecodeError` → 500.

**Fix:** Add regex fallback to extract `{...}` from response before failing.

```python
try:
    data = json.loads(response)
except json.JSONDecodeError:
    match = re.search(r'\{.*\}', response, re.DOTALL)
    if match:
        data = json.loads(match.group())
    else:
        raise ValueError(f"Agent did not return valid JSON. Preview: {response[:300]}")
```

---

## Model Consolidation

### `agent/models.py` — dataclass → Pydantic BaseModel

```python
class Reel(BaseModel):
    url: str
    text_content: str
    auto_tags: list[str] = []

class UserPreference(BaseModel):
    user_id: str = ""
    display_name: str = ""
    selected_tags: list[str] = []
    reels: list[Reel] = []

    def combined_tags(self) -> list[str]: ...
    def to_preference_string(self) -> str: ...
    def save(self, path: str | Path) -> None: ...   # uses model_dump()

    @classmethod
    def load(cls, path: str | Path) -> "UserPreference": ...  # uses model_validate()
```

**Removed:** `from_dict()`, `to_dict()`, `asdict()` usage — replaced by Pydantic's `model_validate()` / `model_dump()`.

**Kept:** `load_user()` still returns `tuple[UserPreference, str]` — the path is needed by `search_pipeline` to write back extracted `auto_tags`.

### `schemas.py` — remove duplicates, add `SpotResult`

```python
from agent.models import UserPreference, Reel   # import, no longer redefined here

# Removed: UserPreference, Reel, UserPreferenceFull class definitions
# Removed: combined_tags from API input (it is derived, not accepted from client)

class SpotResult(BaseModel):
    """Output of /search. Also the input of /plan."""
    query: str
    user_preference: UserPreference   # includes reels; replaces user_preference_full
    top_results: list[TopResult]

# PlanRequest is removed — /plan now accepts SpotResult directly
# All other schemas (Location, Waypoint, Route, PlanResponse, etc.) unchanged
```

---

## API Restructure

### Endpoints

| Method | Path | Input | Output | Auth |
|--------|------|-------|--------|------|
| `GET` | `/health` | — | `{status: "ok"}` | None |
| `POST` | `/search` | `SearchRequest` | `SpotResult` | API Key |
| `POST` | `/plan` | `SpotResult` | `PlanResponse` | API Key |
| `POST` | `/enrich` | `EnrichRequest` | `EnrichResponse` | API Key |
| ~~`POST`~~ | ~~`/search-and-plan`~~ | removed | — | — |

### New: `POST /search`

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    tags: Optional[list[str]] = None
```

Returns `SpotResult`. The `smart_search` field (dead code) is dropped.

### Client Flow

```
POST /search   →   SpotResult
                      ↓
POST /plan     →   PlanResponse
                      ↓
POST /enrich   →   EnrichResponse
```

Each step is independently testable with saved fixtures.

---

## Impact on Other Files

### `agent/preprocessor.py`

`build_persona_description` currently reads `user_preference.get("combined_tags", [])`, but `combined_tags` is a method on `UserPreference`, not a stored field — so `model_dump()` will not include it.

**Fix:** Reconstruct `combined_tags` inside `preprocess()` by validating the dict back into a `UserPreference` object and calling the method:

```python
from agent.models import UserPreference as UP

def preprocess(request_data: dict) -> dict:
    pref_obj = UP.model_validate(request_data.get("user_preference", {}))
    candidates = extract_candidate_places(request_data.get("top_results", []))
    weather = get_taipei_weather()
    persona = build_persona_description(pref_obj)   # pass object, not dict
    ...
```

`build_persona_description` signature changes to accept `UserPreference` directly, accessing `.combined_tags()`, `.display_name`, and `.reels` via the model — no more separate `user_preference_full` dict needed.

### `agent/search_pipeline.py`

Output format changes — removes `user_preference_full` key, returns unified `user_preference`:

```python
# Before
return {
    "query": query,
    "user_preference": { user_id, selected_tags, combined_tags },
    "user_preference_full": preference.to_dict(),
    "top_results": top_results,
}

# After
return {
    "query": query,
    "user_preference": preference.model_dump(),   # full, including reels
    "top_results": top_results,
}
```

This matches the new `SpotResult` schema.

### `test_local.py`

- `--mode search` → calls `POST /search` (was `/search-and-plan`), saves result as `SpotResult`
- `--mode plan` → calls `POST /plan` with saved `SpotResult` (was `spot_result_v1.json`)
- `--mode smoke` → new: chains `/health` → `/search` → `/plan` → `/enrich` with response validation
- `--mode enrich` → unchanged
- `--mode direct` → unchanged (bypasses API)

---

## Files Changed

| File | Change type |
|------|-------------|
| `agent/models.py` | Rewrite (dataclass → Pydantic) |
| `schemas.py` | Simplify (remove duplicates, add SpotResult) |
| `main.py` | Add `/search`, remove `/search-and-plan`, bug fixes |
| `agent/preprocessor.py` | Minor (unified UserPreference) |
| `agent/planner.py` | Bug fixes only |
| `agent/search_pipeline.py` | Output format update |
| `test_local.py` | Update modes, add `--mode smoke` |

---

## What Is Not Changing

- `agent/tools.py` — no changes
- `agent/enricher.py` — no changes
- `agent/planner.py` system prompt — no changes
- `config.py` — no changes
- `visualize.py` — no changes
- `spot_result_v1.json` — needs field update: replace `user_preference` (lean) + `user_preference_full` with single `user_preference` matching new `UserPreference` schema (i.e., include `reels`, remove `combined_tags` key)
