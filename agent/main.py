"""
main.py — YTP Planning Agent FastAPI 服務入口

Endpoints:
  GET  /health   — 健康檢查（不需 API key）
  POST /search   — 關鍵字搜尋景點，回傳 SpotResult
  POST /plan     — 接收 SpotResult → 3 條路線
  POST /enrich   — 接收路線 JSON → 評論 + 照片 + 字幕
"""

import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Form, HTTPException, Security, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy.orm import Session

load_dotenv()

import config
from agent.enricher import enrich_routes
from agent.gemini_client import is_quota_error
from agent.models import UserPreference, load_user
from db.engine import get_session
from db.hidden_spots import (
    add_comment, add_photo, create_hidden_spot,
    get_all_spots, get_spot_by_place_id, serialize_spot,
)
from db.hotels import check_hotel as db_check_hotel
from db.user_loader import load_preference_from_db
from agent.planner import run_planner
from agent.preprocessor import preprocess
from agent.search_pipeline import run as run_search
from schemas import (
    HiddenSpotDetail, HiddenSpotListItem, HiddenSpotSubmitResponse,
    PlanResponse, SpotResult,
)

api_key_header = APIKeyHeader(name="X-API-Key")


def verify_api_key(key: str = Security(api_key_header)) -> None:
    if not config.YTP_API_KEY:
        raise HTTPException(
            status_code=500, detail="YTP_API_KEY not configured on server"
        )
    if not secrets.compare_digest(key, config.YTP_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")


def get_db():
    SessionLocal = get_session()
    with SessionLocal() as db:
        yield db


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="YTP Planning Agent",
    description="台北一日遊規劃 Agent API — 從關鍵字搜尋到路線一站完成",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
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


# ── Hidden Spots ─────────────────────────────────────────────────────────────────


@app.post(
    "/hidden-spots",
    response_model=HiddenSpotSubmitResponse,
    dependencies=[Security(verify_api_key)],
)
async def submit_hidden_spot(
    google_place_id: str = Form(...),
    name: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    vibes: Optional[str] = Form(None),      # JSON array string: '["文青","秘境"]'
    tg_user_id: Optional[int] = Form(None),
    comment_content: Optional[str] = Form(None),
    comment_rating: Optional[int] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    提交隱藏景點：
    - 若 google_place_id 不存在 → 建立新景點（需提供 name）
    - 若已存在 → 直接附加評論/照片
    - 可選擇同時附加評論（comment_content）與照片（photo 檔案）
    """
    spot = get_spot_by_place_id(db, google_place_id)
    created = spot is None

    if created:
        if not name:
            raise HTTPException(status_code=422, detail="新景點必須提供 name")
        vibes_list = json.loads(vibes) if vibes else []
        spot = create_hidden_spot(
            db,
            google_place_id=google_place_id,
            name=name,
            address=address,
            lat=lat,
            lng=lng,
            description=description,
            category=category,
            vibes=vibes_list,
            submitted_by=tg_user_id,
        )

    if comment_content:
        add_comment(db, spot.id, comment_content, user_id=tg_user_id, rating=comment_rating)

    if photo and photo.filename:
        spot_dir = config.HIDDEN_SPOTS_DIR / google_place_id
        spot_dir.mkdir(parents=True, exist_ok=True)
        existing_count = len(list(spot_dir.glob("photo_*.jpg")))
        save_path = spot_dir / f"photo_{existing_count + 1:02d}.jpg"
        save_path.write_bytes(await photo.read())
        add_photo(db, spot.id, str(save_path), uploaded_by=tg_user_id)

    # Reload to get updated relations
    db.refresh(spot)
    return HiddenSpotSubmitResponse(created=created, spot=HiddenSpotDetail(**serialize_spot(spot)))


@app.get(
    "/hidden-spots/{google_place_id}",
    response_model=HiddenSpotDetail,
    dependencies=[Security(verify_api_key)],
)
def get_hidden_spot(google_place_id: str, db: Session = Depends(get_db)):
    """取得單一隱藏景點的詳細資訊（含評論與照片）。"""
    spot = get_spot_by_place_id(db, google_place_id)
    if not spot:
        raise HTTPException(status_code=404, detail="找不到該景點")
    return HiddenSpotDetail(**serialize_spot(spot))


@app.get(
    "/hidden-spots",
    response_model=list[HiddenSpotListItem],
    dependencies=[Security(verify_api_key)],
)
def list_hidden_spots(db: Session = Depends(get_db)):
    """列出所有隱藏景點摘要。"""
    spots = get_all_spots(db)
    return [
        HiddenSpotListItem(
            id=s.id,
            google_place_id=s.google_place_id,
            name=s.name,
            address=s.address,
            category=s.category,
            vibes=s.vibes or [],
            photo_count=len(s.photos),
            comment_count=len(s.comments),
        )
        for s in spots
    ]


# ── Hotel Legality Check (Chrome Extension) ──────────────────────────────────


@app.get("/api/check-hotel")
def check_hotel(
    name: str = "",
    name_en: str = "",
    license_number: str = "",
    lat: float = 0.0,
    lng: float = 0.0,
    source: str = "booking",
    db: Session = Depends(get_db),
):
    """
    驗證旅宿是否合法（供 Chrome extension 使用，不需 API key）。
    比對順序：執照號碼 → GPS → 中文名稱 → 英文名稱
    name_en 非空時，英文名稱比對優先於中文名稱比對。
    """
    return db_check_hotel(db, name=name, name_en=name_en,
                          license_number=license_number,
                          lat=lat, lng=lng, source=source)
