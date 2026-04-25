"""
agent/hotel_search_pipeline.py — 旅宿搜尋與排序（Gemini + fallback）

流程：
1. 先從合法旅宿資料表抓候選（可依地點/關鍵字初步過濾）
2. 用 Gemini 依使用者需求做排序
3. 若 LLM 失敗則退回規則式排序，避免前端無結果
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from db.models import Hotel

from .gemini_client import call_with_fallback

MAX_CANDIDATES = 80


def _normalize(text: str) -> str:
    return text.strip().lower().replace(" ", "").replace("\u3000", "") if text else ""


def _tokenize(text: str) -> list[str]:
    return [
        token.strip()
        for token in re.split(r"[\s,，。！？!?;；、/|]+", text or "")
        if token and token.strip()
    ]


def _city_hint(location: str) -> str | None:
    loc = _normalize(location)
    if not loc:
        return None
    if "台北" in loc or "taipei" in loc:
        return "Taipei"
    if "新北" in loc or "newtaipei" in loc:
        return "New Taipei"
    return None


def _hotel_to_candidate(hotel: Hotel) -> dict[str, Any]:
    return {
        "hotel_id": hotel.hotel_id,
        "name": hotel.name_zh or hotel.name_en or "",
        "name_zh": hotel.name_zh,
        "name_en": hotel.name_en,
        "city": hotel.city,
        "address": hotel.address,
        "license_number": hotel.license_number,
        "lat": hotel.lat,
        "lng": hotel.lng,
        "hotel_class": str(hotel.hotel_class) if hotel.hotel_class is not None else None,
    }


def _query_candidates(
    db: Session,
    *,
    query: str,
    location: str,
    tags: list[str],
    max_candidates: int,
) -> list[dict[str, Any]]:
    city = _city_hint(location)

    q = db.query(Hotel).filter(Hotel.service_status == 1)
    if city:
        q = q.filter(Hotel.city.ilike(f"%{city}%"))

    tokens = _tokenize(" ".join([query, location, " ".join(tags)]))
    token_filters = []
    for token in tokens[:10]:
        like = f"%{token}%"
        token_filters.extend(
            [
                Hotel.name_zh.ilike(like),
                Hotel.name_en.ilike(like),
                Hotel.address.ilike(like),
                Hotel.license_number.ilike(like),
            ]
        )

    if token_filters:
        q = q.filter(or_(*token_filters))

    rows = q.limit(max_candidates).all()

    # 若條件過窄導致無結果，至少回傳該城市的候選
    if not rows and city:
        rows = (
            db.query(Hotel)
            .filter(Hotel.service_status == 1, Hotel.city.ilike(f"%{city}%"))
            .limit(max_candidates)
            .all()
        )

    # 最後兜底：回傳任意合法旅宿
    if not rows:
        rows = db.query(Hotel).filter(Hotel.service_status == 1).limit(max_candidates).all()

    return [_hotel_to_candidate(r) for r in rows]


def _build_ranking_prompt(
    *,
    query: str,
    location: str,
    tags: list[str],
    top_k: int,
    candidates: list[dict[str, Any]],
) -> str:
    tags_str = "、".join(tags) if tags else "無"
    return f"""
你是台灣旅宿推薦排序助手。請根據使用者需求，從候選旅宿中挑選最適合的結果。

使用者需求：
- 關鍵字：{query or "未提供"}
- 地點：{location or "未提供"}
- 偏好標籤：{tags_str}

規則：
- 只能使用候選名單中的 hotel_id，禁止虛構
- 最多輸出 {top_k} 筆
- score 介於 0 到 1（越高越符合）
- reason 請使用繁體中文，25 字內

只輸出 JSON：
{{
  "ranked_hotels": [
    {{"hotel_id": "...", "score": 0.93, "reason": "..."}}
  ]
}}

候選旅宿：
{json.dumps(candidates, ensure_ascii=False)}
""".strip()


def _extract_json(raw_text: str) -> dict[str, Any] | None:
    text = (raw_text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None

    try:
        parsed = json.loads(match.group())
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _rank_with_llm(
    *,
    query: str,
    location: str,
    tags: list[str],
    top_k: int,
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    prompt = _build_ranking_prompt(
        query=query,
        location=location,
        tags=tags,
        top_k=top_k,
        candidates=candidates,
    )

    raw = call_with_fallback(
        "search",
        lambda client, model: client.models.generate_content(
            model=model,
            contents=prompt,
        ).text
        or "",
    )

    payload = _extract_json(raw)
    ranked_payload = payload.get("ranked_hotels") if payload else None
    if not isinstance(ranked_payload, list):
        raise ValueError("Invalid LLM ranking payload")

    candidate_map = {
        c["hotel_id"]: c
        for c in candidates
        if isinstance(c.get("hotel_id"), str) and c.get("hotel_id")
    }

    ranked: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in ranked_payload:
        if not isinstance(row, dict):
            continue

        hotel_id = str(row.get("hotel_id", "")).strip()
        if not hotel_id or hotel_id in seen or hotel_id not in candidate_map:
            continue

        try:
            score = float(row.get("score", 0.0))
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(1.0, score))

        reason = str(row.get("reason", "")).strip()
        ranked.append(
            {
                **candidate_map[hotel_id],
                "score": score,
                "reason": reason,
            }
        )
        seen.add(hotel_id)

        if len(ranked) >= top_k:
            break

    if not ranked:
        raise ValueError("LLM returned empty ranking")

    return ranked


def _rank_with_rules(
    *,
    query: str,
    location: str,
    tags: list[str],
    top_k: int,
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    all_tokens = _tokenize(" ".join([query, location, " ".join(tags)]))
    loc_tokens = _tokenize(location)
    city = _city_hint(location)

    ranked = []
    for candidate in candidates:
        haystack = _normalize(
            " ".join(
                [
                    str(candidate.get("name") or ""),
                    str(candidate.get("name_zh") or ""),
                    str(candidate.get("name_en") or ""),
                    str(candidate.get("city") or ""),
                    str(candidate.get("address") or ""),
                ]
            )
        )

        score = 0.0
        for token in all_tokens:
            if _normalize(token) and _normalize(token) in haystack:
                score += 1.0

        for token in loc_tokens:
            if _normalize(token) and _normalize(token) in haystack:
                score += 1.5

        if city and candidate.get("city") and _normalize(city) in _normalize(str(candidate["city"])):
            score += 2.0

        if candidate.get("license_number"):
            score += 0.2

        ranked.append(
            {
                **candidate,
                "raw_score": score,
            }
        )

    ranked.sort(key=lambda row: row["raw_score"], reverse=True)
    max_score = ranked[0]["raw_score"] if ranked else 0.0

    result = []
    for row in ranked[:top_k]:
        normalized_score = (row["raw_score"] / max_score) if max_score > 0 else 0.0
        reason = "符合關鍵字與地點條件" if row["raw_score"] > 0 else "一般推薦"
        result.append(
            {
                **{k: v for k, v in row.items() if k != "raw_score"},
                "score": max(0.0, min(1.0, float(normalized_score))),
                "reason": reason,
            }
        )

    return result


def search_and_rank_hotels(
    db: Session,
    *,
    query: str,
    location: str = "",
    tags: list[str] | None = None,
    top_k: int = 8,
) -> dict[str, Any]:
    tags = [t.strip() for t in (tags or []) if t and t.strip()]
    top_k = max(1, min(int(top_k), 20))

    candidates = _query_candidates(
        db,
        query=query,
        location=location,
        tags=tags,
        max_candidates=MAX_CANDIDATES,
    )

    if not candidates:
        return {
            "query": query,
            "location": location,
            "tags": tags,
            "total_candidates": 0,
            "ranked_hotels": [],
            "used_llm": False,
            "warning": "目前找不到可用的旅宿資料。",
        }

    warning = None
    used_llm = True

    try:
        ranked_hotels = _rank_with_llm(
            query=query,
            location=location,
            tags=tags,
            top_k=top_k,
            candidates=candidates,
        )
    except Exception:
        used_llm = False
        warning = "LLM 排序暫時不可用，已改用條件排序。"
        ranked_hotels = _rank_with_rules(
            query=query,
            location=location,
            tags=tags,
            top_k=top_k,
            candidates=candidates,
        )

    return {
        "query": query,
        "location": location,
        "tags": tags,
        "total_candidates": len(candidates),
        "ranked_hotels": ranked_hotels,
        "used_llm": used_llm,
        "warning": warning,
    }
