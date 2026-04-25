"""
main.py — YTP Planning Agent FastAPI 服務入口

Endpoints:
  GET  /health   — 健康檢查（不需 API key）
  POST /search   — 關鍵字搜尋景點，回傳 SpotResult
  POST /plan     — 接收 SpotResult → 3 條路線
  POST /enrich   — 接收路線 JSON → 評論 + 照片 + 字幕
"""

import asyncio
import secrets
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel

load_dotenv()

import config
from agent.enricher import enrich_routes
from agent.gemini_client import is_quota_error
from agent.models import UserPreference, load_user
from db.user_loader import load_preference_from_db
from agent.planner import run_planner
from agent.preprocessor import preprocess
from agent.search_pipeline import run as run_search
from schemas import PlanResponse, SpotResult

api_key_header = APIKeyHeader(name="X-API-Key")


def verify_api_key(key: str = Security(api_key_header)) -> None:
    if not config.YTP_API_KEY:
        raise HTTPException(
            status_code=500, detail="YTP_API_KEY not configured on server"
        )
    if not secrets.compare_digest(key, config.YTP_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="YTP Planning Agent",
    description="台北一日遊規劃 Agent API — 從關鍵字搜尋到路線一站完成",
    version="0.4.0",
    lifespan=lifespan,
)


# ── Request / Response schemas ──────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    tg_user_id: Optional[int] = None   # Telegram user ID — loads preference from DB
    tags: Optional[list[str]] = None


class EnrichRequest(BaseModel):
    recommended_routes: list


class EnrichResponse(BaseModel):
    run_id: str
    output_dir: str
    routes: dict


# ── Endpoints ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/search", response_model=SpotResult, dependencies=[Security(verify_api_key)])
async def search(request: SearchRequest):
    """
    用關鍵字搜尋台北景點（Gemini + Google Search Grounding）。
    回傳 SpotResult 格式，可直接傳給 POST /plan。
    """
    try:
        preference = UserPreference()
        preference_path = None

        if request.tg_user_id is not None:
            preference = load_preference_from_db(request.tg_user_id)
        elif request.user_id:
            preference, preference_path = load_user(request.user_id, config.USERS_DIR)

        if request.tags:
            merged = list(dict.fromkeys(preference.selected_tags + request.tags))
            preference = preference.model_copy(update={"selected_tags": merged})

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_search(
                query=request.query,
                preference=preference,
                preference_path=preference_path,
            ),
        )
        return SpotResult.model_validate(result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        if is_quota_error(e):
            raise HTTPException(status_code=429, detail="Gemini API 配額已用盡，請稍後再試")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/plan", response_model=PlanResponse, dependencies=[Security(verify_api_key)])
async def plan(request: SpotResult):
    """
    接收 SpotResult（/search 的輸出），回傳 3 條優化路線。
    適合已有搜尋結果、只需要規劃的情境。
    """
    try:
        context = preprocess(request.model_dump())
        result = await run_planner(context)
        return PlanResponse(**result)
    except Exception as e:
        if is_quota_error(e):
            raise HTTPException(status_code=429, detail="Gemini API 配額已用盡，請稍後再試")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/enrich", response_model=EnrichResponse, dependencies=[Security(verify_api_key)]
)
async def enrich(request: EnrichRequest):
    """
    對規劃完成的 3 條路線，針對每個景點：
      1. 抓取最新 5 則 + 最熱門 5 則 Google 評論
      2. 下載最多 10 張 Google Maps 照片至本地
      3. 用 Gemini 生成 2-3 段短影片字幕

    結果儲存至 data/routes/{run_id}/，並回傳摘要。
    """
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: enrich_routes(request.recommended_routes),
        )
        return EnrichResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
