# Gemini API Fallback Design

**Date:** 2026-04-05
**Scope:** Multi-key rotation + model downgrade when hitting free-tier quota limits

---

## Problem

Google AI Studio free tier limits gemini-2.5-flash to 20 RPD per API key.
Development testing exhauts this quickly. Three free-tier keys + model downgrade
to gemini-3.1-flash-lite (500 RPD) solves this without Vertex AI complexity.

---

## Quota Reference (Key #1, as of 2026-04-05)

| Model | RPD Limit | RPD Used | Search Grounding |
|-------|-----------|----------|-----------------|
| gemini-2.5-flash | 20 | 28 ❌ | ✅ 1.5K/day |
| gemini-2.5-flash-lite | 20 | 25 ❌ | ❌ |
| gemini-3.1-flash-lite | 500 | 0 ✅ | ✅ 500/day |
| gemini-3-flash | 20 | 0 ✅ | ❌ |

**gemini-3.1-flash-lite** is the primary fallback: 500 RPD, supports search grounding.

---

## Model Assignment by Use Case

| Use Case | Primary | Fallback 1 | Fallback 2 | Notes |
|----------|---------|-----------|-----------|-------|
| search (grounding) | gemini-2.5-flash | gemini-3.1-flash-lite | — | Both support Search Grounding |
| planner (ADK agent) | gemini-2.5-flash | gemini-3.1-flash-lite | gemini-3-flash | Model-only fallback (ADK reads GOOGLE_API_KEY from env) |
| caption (enricher) | gemini-2.5-flash-lite | gemini-3.1-flash-lite | — | Simple text task |
| tag (reel extraction) | gemini-2.5-flash-lite | gemini-3.1-flash-lite | — | Simple classification |

---

## Architecture

### Retry Order

For each Gemini call, try combinations in this order:

```
(KEY_1, primary_model) → (KEY_2, primary_model) → (KEY_3, primary_model)
  → (KEY_1, fallback_1) → (KEY_2, fallback_1) → (KEY_3, fallback_1)
  → (KEY_1, fallback_2) → ...
```

On non-quota errors (e.g. invalid input, network), raise immediately — don't retry.

### New File: `agent/gemini_client.py`

Central module owning all fallback logic. All other agent modules import from here.

```python
def get_client(api_key: str) -> genai.Client:
    """Create a genai.Client for a given key."""

def call_with_fallback(
    use_case: str,          # "search" | "planner" | "caption" | "tag"
    func: Callable,         # (client, model, ...) -> result
    *args,
    **kwargs,
) -> Any:
    """
    Try each (api_key × model) combination from config.MODELS[use_case].
    Raises RuntimeError if all combinations are exhausted.
    Raises immediately on non-quota errors.
    """

def is_quota_error(e: Exception) -> bool:
    """True if error is 429 RESOURCE_EXHAUSTED."""
```

### `config.py` Changes

```python
# Multiple API keys — empty strings filtered out automatically
GOOGLE_API_KEYS: list[str] = [
    k for k in [
        os.getenv("GOOGLE_API_KEY", ""),
        os.getenv("GOOGLE_API_KEY_2", ""),
        os.getenv("GOOGLE_API_KEY_3", ""),
    ]
    if k
]

# Keep GOOGLE_API_KEY as alias for backwards compat (ADK uses it directly)
GOOGLE_API_KEY: str = GOOGLE_API_KEYS[0] if GOOGLE_API_KEYS else ""

# Model fallback chains per use case
MODELS: dict[str, list[str]] = {
    "search":  ["gemini-2.5-flash", "gemini-3.1-flash-lite"],
    "planner": ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash"],
    "caption": ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"],
    "tag":     ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"],
}
```

### `.env.example` Changes

Add:
```
GOOGLE_API_KEY_2=      # Free tier key #2
GOOGLE_API_KEY_3=      # Free tier key #3
```

---

## Changes per File

### `agent/gemini_client.py` (new)

Full fallback logic. See architecture above.

### `config.py`

- `GOOGLE_API_KEY` → derived from `GOOGLE_API_KEYS[0]` (no behaviour change for existing code)
- Add `GOOGLE_API_KEYS: list[str]`
- Add `MODELS: dict[str, list[str]]`

### `agent/search_pipeline.py`

`_search_with_grounding()`: replace manual `genai.Client(api_key=config.GOOGLE_API_KEY)` + `client.models.generate_content(model=config.GEMINI_MODEL, ...)` with `call_with_fallback("search", ...)`.

`_extract_reel_tags()`: same, use `call_with_fallback("tag", ...)`.

### `agent/planner.py`

ADK `Runner` reads `GOOGLE_API_KEY` from environment — it does not accept a `genai.Client` object directly, so **key rotation is not available for the planner**. Only model downgrade applies.

`run_planner()`: wrap the runner loop in try/except; on quota error, retry with the next model in `config.MODELS["planner"]`. The `Agent` object is recreated with the new `model=` value each attempt.

### `agent/enricher.py`

`_generate_captions()`: replace `google_genai.Client(api_key=config.GOOGLE_API_KEY)` with `call_with_fallback("caption", ...)`.

### `main.py`

No changes to endpoints. The 429 → 500 wrapping issue: add `_raise_for_gemini_quota(e)` call before the generic 500 in `/plan` and `/search` to surface proper 429 to clients.

---

## What Is Not Changing

- `agent/tools.py` — uses Google Maps API, not Gemini
- `agent/preprocessor.py` — no Gemini calls
- `schemas.py`, `agent/models.py` — no changes
- ADK session / runner logic — unchanged, only `model=` parameter changes

---

## Logging

Each fallback attempt should print:
```
[Gemini] ⚠ KEY_1 / gemini-2.5-flash → 429，改用 KEY_2 / gemini-2.5-flash
[Gemini] ⚠ KEY_2 / gemini-2.5-flash → 429，改用 KEY_1 / gemini-3.1-flash-lite
```

So developers can see the fallback chain in action.
