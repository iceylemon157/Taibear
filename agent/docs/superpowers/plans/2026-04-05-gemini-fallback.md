# Gemini API Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-key rotation + model downgrade so Gemini free-tier quota exhaustion automatically falls back instead of returning 500.

**Architecture:** New `agent/gemini_client.py` owns all fallback logic; `config.py` holds key list + per-use-case model chains; search_pipeline/enricher/planner call the fallback helper instead of creating clients directly. ADK planner only does model downgrade (not key rotation) because ADK reads `GOOGLE_API_KEY` from the environment.

**Tech Stack:** Python 3.11, google-genai, google-adk, Pydantic, FastAPI

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `config.py` | Modify | Add `GOOGLE_API_KEYS`, `MODELS`; derive `GOOGLE_API_KEY` from list |
| `agent/gemini_client.py` | **Create** | `is_quota_error()`, `call_with_fallback()` |
| `agent/search_pipeline.py` | Modify | `_extract_reel_tags`, `_search_with_grounding` use `call_with_fallback` |
| `agent/enricher.py` | Modify | `_generate_captions` uses `call_with_fallback` |
| `agent/planner.py` | Modify | `run_planner` retries with next model on quota error |
| `main.py` | Modify | Propagate quota errors as HTTP 429 |
| `.env.example` | Modify | Add `GOOGLE_API_KEY_2`, `GOOGLE_API_KEY_3` |

---

## Task 1: Update `config.py` — multi-key + model chains

**Files:**
- Modify: `config.py`

- [ ] **Step 1: Replace the Gemini section in `config.py`**

Find this block:
```python
# ── Gemini ─────────────────────────────────────────────────────────────────────

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL: str = "gemini-2.5-flash"
```

Replace with:
```python
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
    "search":  ["gemini-2.5-flash", "gemini-3.1-flash-lite"],
    "planner": ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash"],
    "caption": ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"],
    "tag":     ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"],
}
```

- [ ] **Step 2: Verify config loads and has expected structure**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "
import config
print('keys:', len(config.GOOGLE_API_KEYS), 'found')
print('primary key set:', bool(config.GOOGLE_API_KEY))
print('MODELS keys:', list(config.MODELS.keys()))
print('planner chain:', config.MODELS['planner'])
"
```

Expected (with only KEY_1 set):
```
keys: 1 found
primary key set: True
MODELS keys: ['search', 'planner', 'caption', 'tag']
planner chain: ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash']
```

- [ ] **Step 3: Commit**

```bash
git add config.py
git commit -m "feat: add GOOGLE_API_KEYS list and per-use-case MODELS chains to config"
```

---

## Task 2: Create `agent/gemini_client.py` — fallback helper

**Files:**
- Create: `agent/gemini_client.py`

- [ ] **Step 1: Create `agent/gemini_client.py`**

```python
"""
agent/gemini_client.py — Gemini API 呼叫集中管理與配額 fallback

提供 call_with_fallback()，在 429 RESOURCE_EXHAUSTED 時自動依序嘗試：
  每個 model（外層）× 每個 api_key（內層）
  
ADK 規劃器不在此管理（它讀環境變數，見 planner.py）。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from google import genai

import config


def is_quota_error(e: Exception) -> bool:
    """True if the exception is a Gemini 429 RESOURCE_EXHAUSTED."""
    msg = str(e)
    return "RESOURCE_EXHAUSTED" in msg or "429" in msg


def call_with_fallback(
    use_case: str,
    func: Callable[[genai.Client, str], Any],
) -> Any:
    """
    Try each (model × api_key) combination until one succeeds.

    Iteration order:
      for model in config.MODELS[use_case]:
        for api_key in config.GOOGLE_API_KEYS:
          try func(client, model)

    Args:
        use_case: key into config.MODELS — "search" | "planner" | "caption" | "tag"
        func:     (client, model) -> result  (other args captured via closure)

    Raises:
        RuntimeError: if all combinations are exhausted
        Exception:    immediately on any non-quota error
    """
    models = config.MODELS.get(use_case, [])
    if not models:
        raise ValueError(f"Unknown use_case: {use_case!r}. Valid: {list(config.MODELS)}")

    keys = config.GOOGLE_API_KEYS
    if not keys:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    for model in models:
        for api_key in keys:
            key_hint = api_key[:8] + "..."
            try:
                client = genai.Client(api_key=api_key)
                return func(client, model)
            except Exception as e:
                if is_quota_error(e):
                    print(f"[Gemini] ⚠ {key_hint} / {model} → 配額已用盡，嘗試下一個")
                    continue
                raise  # non-quota error: don't retry

    raise RuntimeError(
        f"[Gemini] {use_case}: 所有 API key 與模型均已超出配額\n"
        f"  嘗試過: {models} × {[k[:8] + '...' for k in keys]}"
    )
```

- [ ] **Step 2: Verify the module imports cleanly**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "
from agent.gemini_client import call_with_fallback, is_quota_error
print('import ok')

# Verify is_quota_error detects the right patterns
class FakeError(Exception): pass
assert is_quota_error(FakeError('429 RESOURCE_EXHAUSTED quota'))
assert not is_quota_error(FakeError('network timeout'))
print('is_quota_error: ok')
"
```

Expected:
```
import ok
is_quota_error: ok
```

- [ ] **Step 3: Commit**

```bash
git add agent/gemini_client.py
git commit -m "feat: add agent/gemini_client.py with call_with_fallback and is_quota_error"
```

---

## Task 3: Update `agent/search_pipeline.py` — use call_with_fallback

**Files:**
- Modify: `agent/search_pipeline.py`

Two functions change: `_extract_reel_tags` and `_search_with_grounding`. Both currently receive a `client: genai.Client` parameter from `run()`. After this task, they call `call_with_fallback` internally and no longer take `client` as a parameter.

- [ ] **Step 1: Add import at top of `agent/search_pipeline.py`**

Find the existing imports block (starts with `from __future__ import annotations`). Add after the existing imports:

```python
from .gemini_client import call_with_fallback
```

- [ ] **Step 2: Replace `_extract_reel_tags` signature and inner call**

Find the function `def _extract_reel_tags(reel, existing_tags, client)` and replace it entirely:

```python
def _extract_reel_tags(
    reel: Reel,
    existing_tags: list[str],
) -> None:
    """
    用 Gemini 從 Reel 文字內容萃取偏好標籤，結果直接寫入 reel.auto_tags。
    existing_tags 用來避免生成重複或語意相同的標籤。
    自動 fallback：tag 模型鏈 × 所有 API key。
    """
    if not reel.text_content.strip():
        return

    existing_part = ""
    if existing_tags:
        existing_part = (
            "\n\n已有的偏好標籤（請避免生成語意相同或高度相似的標籤）：\n"
            + "\n".join(f"- {t}" for t in existing_tags)
        )

    prompt = _REEL_TAG_PROMPT.format(
        existing_part=existing_part,
        text_content=reel.text_content,
    )

    raw = ""
    cleaned = ""
    try:
        raw = (
            call_with_fallback(
                "tag",
                lambda client, model: client.models.generate_content(
                    model=model,
                    contents=prompt,
                ).text
                or "",
            )
        )
        cleaned = re.sub(
            r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE
        ).strip()
        tags = json.loads(cleaned)
        if isinstance(tags, list):
            reel.auto_tags = [str(t) for t in tags]
            return
    except (json.JSONDecodeError, ValueError):
        pass
    except Exception as e:
        print(f"[Search] ⚠ Reel tag 萃取失敗：{e}")
        return

    # Fallback：嘗試用逗號/換行分割
    if cleaned:
        reel.auto_tags = [
            t.strip() for t in re.split(r"[,，、\n]", cleaned) if t.strip()
        ]
```

- [ ] **Step 3: Replace `_search_with_grounding` signature and inner call**

Find `def _search_with_grounding(query, preference, client)` and replace it entirely:

```python
def _search_with_grounding(
    query: str,
    preference: UserPreference,
) -> list[dict]:
    """
    呼叫 Gemini + Google Search Grounding，一步完成搜尋 + 景點萃取。
    自動 fallback：search 模型鏈 × 所有 API key。
    """
    all_tags = preference.combined_tags()
    tags_str = "、".join(all_tags) if all_tags else "無特定偏好"

    prompt = _SEARCH_PROMPT.format(
        query=query,
        tags=tags_str,
        top_k=config.SEARCH_PLACES_TOP_K,
    )

    print(f"[Search] Gemini Search Grounding：{query!r}（偏好：{tags_str}）")

    try:
        raw_text = call_with_fallback(
            "search",
            lambda client, model: (
                client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                    ),
                ).text
                or ""
            ),
        )
    except Exception as e:
        print(f"[Search] ⚠ Gemini Search Grounding 失敗：{e}")
        return []

    return _parse_top_results(raw_text)
```

- [ ] **Step 4: Update `run()` — remove client creation and update call sites**

In `run()`, find:

```python
    client = genai.Client(api_key=config.GOOGLE_API_KEY)

    # ── Step 0：萃取 Reel 偏好標籤（僅處理尚未標記的） ─────────────────────
    untagged = [
        r for r in preference.reels if not r.auto_tags and r.text_content.strip()
    ]
    if untagged:
        print(f"[Search] 從 {len(untagged)} 個 reel 萃取偏好標籤...")
        for reel in untagged:
            accumulated = list(
                dict.fromkeys(
                    preference.selected_tags
                    + [t for r in preference.reels for t in r.auto_tags]
                )
            )
            _extract_reel_tags(reel, accumulated, client)
            print(f"         {reel.url} → {reel.auto_tags}")
```

Replace with (remove `client = genai.Client(...)` and drop `client` arg from `_extract_reel_tags`):

```python
    # ── Step 0：萃取 Reel 偏好標籤（僅處理尚未標記的） ─────────────────────
    untagged = [
        r for r in preference.reels if not r.auto_tags and r.text_content.strip()
    ]
    if untagged:
        print(f"[Search] 從 {len(untagged)} 個 reel 萃取偏好標籤...")
        for reel in untagged:
            accumulated = list(
                dict.fromkeys(
                    preference.selected_tags
                    + [t for r in preference.reels for t in r.auto_tags]
                )
            )
            _extract_reel_tags(reel, accumulated)
            print(f"         {reel.url} → {reel.auto_tags}")
```

Also update the `_search_with_grounding` call site — find:
```python
    top_results = _search_with_grounding(query, preference, client)
```
Replace with:
```python
    top_results = _search_with_grounding(query, preference)
```

- [ ] **Step 5: Verify import works**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from agent.search_pipeline import run; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 6: Commit**

```bash
git add agent/search_pipeline.py
git commit -m "feat: search_pipeline uses call_with_fallback for search grounding and reel tag extraction"
```

---

## Task 4: Update `agent/enricher.py` — captions use call_with_fallback

**Files:**
- Modify: `agent/enricher.py`

`_generate_captions` currently creates its own `google_genai.Client` with `config.GOOGLE_API_KEY` hardcoded. Replace with `call_with_fallback("caption", ...)`.

- [ ] **Step 1: Add import at top of `agent/enricher.py`**

Find the existing imports (after `import config`). Add:

```python
from .gemini_client import call_with_fallback
```

- [ ] **Step 2: Replace `_generate_captions` body**

Find `def _generate_captions(place_name, newest, relevant)` and replace the function body:

```python
def _generate_captions(
    place_name: str,
    newest: list[dict],
    relevant: list[dict],
) -> list[str]:
    """
    呼叫 Gemini 根據評論生成 2-3 段短影片字幕。
    自動 fallback：caption 模型鏈 × 所有 API key。

    Returns:
        字幕清單，每段 < 20 中文字並含 emoji。
    """
    prompt = _CAPTION_PROMPT.format(
        place_name=place_name,
        newest_reviews=_format_reviews_for_prompt(newest),
        relevant_reviews=_format_reviews_for_prompt(relevant),
    )

    raw = ""
    try:
        raw = (
            call_with_fallback(
                "caption",
                lambda client, model: (
                    client.models.generate_content(
                        model=model,
                        contents=prompt,
                    ).text
                    or ""
                ).strip(),
            )
        )
        # 去除可能的 markdown fence
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list) and parsed:
            return [str(c) for c in parsed]
    except json.JSONDecodeError:
        # LLM 有時會回傳格式略有不同，嘗試用 regex 提取陣列
        match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
                if isinstance(parsed, list) and parsed:
                    return [str(c) for c in parsed]
            except json.JSONDecodeError:
                pass
        print("[Enrich]   ⚠ 字幕解析失敗，使用預設值")
    except Exception as e:
        print(f"[Enrich]   ⚠ 字幕生成失敗 ({place_name}): {e}")

    # Fallback
    return [f"✨ {place_name}", "📍 值得一訪的好地方"]
```

- [ ] **Step 3: Verify import works**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from agent.enricher import enrich_routes; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 4: Commit**

```bash
git add agent/enricher.py
git commit -m "feat: enricher captions use call_with_fallback for model/key rotation"
```

---

## Task 5: Update `agent/planner.py` — model-only fallback for ADK

**Files:**
- Modify: `agent/planner.py`

ADK reads `GOOGLE_API_KEY` from env — key rotation not possible. Wrap `run_planner` to retry with the next model in `config.MODELS["planner"]` on quota error.

- [ ] **Step 1: Add import at top of `agent/planner.py`**

Find the existing imports. Add:

```python
import config
from .gemini_client import is_quota_error
```

(Note: `config` may already be imported — check first. `is_quota_error` is new.)

- [ ] **Step 2: Extract `_run_planner_with_model` helper and update `run_planner`**

Replace `run_planner` with two functions:

```python
async def _run_planner_with_model(context: dict, model: str) -> dict:
    """
    Single attempt: run the ADK planner with a specific model.
    Raises on any error (including quota); caller handles fallback.
    """
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    agent = Agent(
        name="taipei_day_planner",
        model=model,
        instruction=SYSTEM_PROMPT,
        tools=[geocode_places, search_places, evaluate_route],
    )

    user_message = _build_user_message(context)

    session_service = InMemorySessionService()
    await session_service.create_session(
        app_name="ytp_planner",
        user_id="user",
        session_id="session_1",
    )

    runner = Runner(
        agent=agent,
        app_name="ytp_planner",
        session_service=session_service,
    )

    final_response = ""
    async for event in runner.run_async(
        user_id="user",
        session_id="session_1",
        new_message=genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=user_message)],
        ),
    ):
        if event.is_final_response() and event.content and event.content.parts:
            texts = [p.text for p in event.content.parts if getattr(p, "text", None)]
            if texts:
                final_response = "".join(texts)

    return _parse_agent_response(final_response or "")


async def run_planner(context: dict) -> dict:
    """
    執行規劃 Agent，回傳解析後的路線 JSON。
    遇 429 自動降級到下一個模型（ADK 不支援 key 輪替）。
    """
    models = config.MODELS["planner"]
    last_error: Exception | None = None

    for model in models:
        try:
            print(f"[Planner] 使用模型：{model}")
            return await _run_planner_with_model(context, model)
        except Exception as e:
            if is_quota_error(e):
                print(f"[Planner] ⚠ {model} → 配額已用盡，改用下一個模型")
                last_error = e
                continue
            raise  # non-quota error: propagate immediately

    raise RuntimeError(
        f"[Planner] 所有模型均已超出配額：{models}"
    ) from last_error
```

Also remove `create_planner_agent()` since its logic is now inside `_run_planner_with_model`. If nothing else imports it, delete it. If it's imported elsewhere, keep it but mark as deprecated.

Check: `grep -r "create_planner_agent" /Users/littlepants/Dev/YTP_Planning_Agent --include="*.py" --exclude-dir=.venv`

If only defined in `planner.py` and not imported elsewhere, remove it.

- [ ] **Step 3: Verify import works**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from agent.planner import run_planner; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 4: Commit**

```bash
git add agent/planner.py
git commit -m "feat: planner retries with model fallback chain on quota error"
```

---

## Task 6: Update `main.py` + `.env.example` — surface 429 properly

**Files:**
- Modify: `main.py`
- Modify: `.env.example`

When all fallbacks are exhausted, `run_planner` raises `RuntimeError` and `call_with_fallback` raises `RuntimeError`. Both get swallowed as HTTP 500. Add a check to convert quota `RuntimeError` to HTTP 429.

- [ ] **Step 1: Add quota error check to `main.py`**

Find the import block at the top of `main.py` (after the `from agent.*` imports). Add:

```python
from agent.gemini_client import is_quota_error
```

Find the `/plan` endpoint handler:
```python
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Replace with:
```python
    except Exception as e:
        if is_quota_error(e) or "所有模型均已超出配額" in str(e) or "所有 API key" in str(e):
            raise HTTPException(status_code=429, detail=f"Gemini 配額已耗盡，請稍後再試或新增更多 API key。詳情：{e}")
        raise HTTPException(status_code=500, detail=str(e))
```

Do the same for the `/search` endpoint (its `call_with_fallback` can also raise `RuntimeError`).

- [ ] **Step 2: Update `.env.example`**

Replace file content:

```
GOOGLE_API_KEY=your_gemini_api_key_here       # Free-tier key #1
GOOGLE_API_KEY_2=                              # Free-tier key #2 (optional, for quota rotation)
GOOGLE_API_KEY_3=                              # Free-tier key #3 (optional, for quota rotation)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
YTP_API_KEY=your_secret_api_key_here
```

- [ ] **Step 3: Verify app loads**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from main import app; print('routes:', [r.path for r in app.routes])"
```

Expected: `/health`, `/search`, `/plan`, `/enrich`

- [ ] **Step 4: Commit**

```bash
git add main.py .env.example
git commit -m "feat: surface Gemini quota exhaustion as HTTP 429; add KEY_2/KEY_3 to .env.example"
```

---

## Task 7: Add KEY_2 and KEY_3 to `.env` and smoke test

**Files:**
- Modify: `.env` (local only, not committed)

- [ ] **Step 1: Add KEY_2 and KEY_3 to `.env`**

Open `.env` and add the two new keys provided by the user:

```
GOOGLE_API_KEY_2=<paste key here>
GOOGLE_API_KEY_3=<paste key here>
```

- [ ] **Step 2: Verify all 3 keys are loaded**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "
import config
print('keys loaded:', len(config.GOOGLE_API_KEYS))
for k in config.GOOGLE_API_KEYS:
    print(' -', k[:12] + '...')
"
```

Expected: `keys loaded: 3` (or 2 if only two extra keys provided)

- [ ] **Step 3: Start server and run smoke test**

In a separate terminal:
```bash
uv run uvicorn main:app --reload
```

Then run:
```bash
uv run python test_local.py --mode smoke --query "台北美術文青" --no-open --verbose
```

Watch the output for fallback messages like:
```
[Gemini] ⚠ AIzaSy... / gemini-2.5-flash → 配額已用盡，嘗試下一個
[Gemini] ⚠ AIzaSy... / gemini-2.5-flash → 配額已用盡，嘗試下一個
[Planner] 使用模型：gemini-3.1-flash-lite
```

Expected final line: `✅ Smoke test 完成！所有 4 個 API 正常。`
