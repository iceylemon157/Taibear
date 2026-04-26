"""
本地測試腳本 — 呼叫 API 並自動視覺化路線

用法：
  # 搜尋景點（POST /search，需要 server）
  uv run python test_local.py --mode search --query "台北美術文青" --user alice

  # 用搜尋結果規劃路線（POST /plan，需要 server）
  uv run python test_local.py --mode plan

  # 完整 smoke test：health → search → plan → enrich
  uv run python test_local.py --mode smoke --query "台北美術文青" --user alice

  # 對上次的路線結果執行 enrichment（POST /enrich，需要 server）
  uv run python test_local.py --mode enrich

  # 直接跑 pipeline（不需要 server，適合 debug）
  uv run python test_local.py --mode direct --query "台北美術文青" --user alice

  # 不開瀏覽器，只存檔
  uv run python test_local.py --mode smoke --no-open

  # 顯示完整 API 回應與錯誤
  uv run python test_local.py --mode search --verbose
"""

import argparse
import asyncio
import json
import os
import sys
import traceback
import webbrowser
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://127.0.0.1:8000"
API_KEY = os.getenv("YTP_API_KEY", "")
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
OUTPUT_JSON = "last_result.json"
OUTPUT_MAP = "routes_map.html"

VERBOSE = False  # 由 --verbose flag 設定


# ═══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def vprint(*args, **kwargs):
    """只在 --verbose 時印出。"""
    if VERBOSE:
        print(*args, **kwargs)


def check_server() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def _handle_response_error(r: httpx.Response) -> None:
    """顯示 API 錯誤的完整內容後 exit。"""
    print(f"\n❌ API 回傳 {r.status_code}")
    try:
        detail = r.json()
        print(f"   錯誤內容：{json.dumps(detail, ensure_ascii=False, indent=2)}")
    except Exception:
        print(f"   Raw body：{r.text[:500]}")
    sys.exit(1)


def _save_and_visualize(data: dict, open_browser: bool) -> None:
    """將結果存檔並視覺化。"""
    from visualize import visualize

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"💾 結果存至 {OUTPUT_JSON}")
    vprint(f"   （共 {len(json.dumps(data))} bytes）")

    routes_data = data if "recommended_routes" in data else {}
    if not routes_data:
        print("⚠️  回應中沒有 recommended_routes，跳過視覺化")
        return

    visualize(routes_data, OUTPUT_MAP)
    print(f"🗺  地圖存至 {OUTPUT_MAP}")

    if open_browser:
        webbrowser.open(f"file://{Path(OUTPUT_MAP).resolve()}")
        print("🌐 已在瀏覽器開啟")
    else:
        print(f"👉 手動開啟：open {OUTPUT_MAP}")


def _print_route_summary(routes: list) -> None:
    """印出路線摘要。"""
    print(f"\n📋 規劃結果（{len(routes)} 條路線）：")
    for route in routes:
        wps = route.get("waypoints", [])
        names = " → ".join(wp.get("name", "?") for wp in wps)
        tsp = route.get("tsp_evaluation", {})
        print(f"  [{route.get('route_id', '?')}] {route.get('route_name', '?')}")
        print(f"       景點：{names}")
        print(
            f"       交通：{tsp.get('total_transit_time_mins', '?')} 分鐘"
            f"  smoothness={tsp.get('smoothness_score', '?')}"
        )
        print(f"       地圖：{route.get('google_maps_url', '')}")


# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: plan（POST /plan，用 spot_result_v1.json）
# ═══════════════════════════════════════════════════════════════════════════════


def run_plan(open_browser: bool) -> None:
    input_file = Path("spot_result_v1.json")
    if not input_file.exists():
        print("❌ spot_result_v1.json 不存在")
        sys.exit(1)

    print("📡 POST /plan（使用 spot_result_v1.json）...")
    with open(input_file, encoding="utf-8") as f:
        payload = json.load(f)

    vprint(f"   Payload keys: {list(payload.keys())}")

    r = httpx.post(f"{BASE_URL}/plan", json=payload, headers=HEADERS, timeout=180)
    if r.status_code != 200:
        _handle_response_error(r)

    result = r.json()
    routes = result.get("recommended_routes", [])
    _print_route_summary(routes)
    _save_and_visualize(result, open_browser)


# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: search（POST /search）
# ═══════════════════════════════════════════════════════════════════════════════


def run_search(query: str, user_id: str | None, open_browser: bool) -> None:
    payload: dict = {"query": query}
    if user_id:
        payload["user_id"] = user_id

    print(f"📡 POST /search")
    print(f"   query={query!r}  user={user_id or '(無)'}")
    print("   （搜尋需要 30~60 秒，請稍候...）")

    vprint(f"\n   Payload: {json.dumps(payload, ensure_ascii=False)}")

    r = httpx.post(f"{BASE_URL}/search", json=payload, headers=HEADERS, timeout=180)
    if r.status_code != 200:
        _handle_response_error(r)

    result = r.json()
    top = result.get("top_results", [])
    print(f"\n📋 搜尋結果（{len(top)} 筆）：")
    for item in top[:3]:
        places = [p["name"] for p in item.get("extracted_places", [])]
        print(f"  [{item.get('rank')}] {item.get('title', '')} — 景點：{places}")
    if len(top) > 3:
        print(f"  ... 以及 {len(top) - 3} 筆")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n💾 SpotResult 存至 {OUTPUT_JSON}（可接著跑 --mode plan）")


# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: direct（直接跑 Python pipeline，不需要 server）
# ═══════════════════════════════════════════════════════════════════════════════


def run_direct(query: str, user_id: str | None, open_browser: bool) -> None:
    """
    直接執行完整 pipeline（search → preprocess → plan），不透過 FastAPI。
    適合 debug 時使用，例外會顯示完整 traceback。
    """
    import config
    from agent.models import UserPreference, load_user
    from agent.planner import run_planner
    from agent.preprocessor import preprocess
    from agent.search_pipeline import run as run_search

    print("🔧 Direct mode（繞過 API，直接執行 pipeline）")
    print(f"   query={query!r}  user={user_id or '(無)'}\n")

    # Step 1: 載入使用者偏好
    preference = None
    preference_path = None
    if user_id:
        print(f"👤 載入使用者偏好：{user_id}")
        preference, preference_path = load_user(user_id, config.USERS_DIR)
        print(f"   combined_tags = {preference.combined_tags()}\n")

    # Step 2: Search
    print("🔍 Step 1/3：Gemini Search Grounding 搜尋景點...")
    try:
        search_result = run_search(
            query=query,
            preference=preference,
            preference_path=preference_path,
        )
        top = search_result.get("top_results", [])
        print(f"   → {len(top)} 筆搜尋結果")
        for r in top[:3]:
            places = [p["name"] for p in r.get("extracted_places", [])]
            print(f"     [{r.get('rank')}] {r.get('title', '')} — 景點：{places}")
        if len(top) > 3:
            print(f"     ... 以及 {len(top) - 3} 筆")
    except Exception:
        print("❌ Search 階段失敗：")
        traceback.print_exc()
        sys.exit(1)

    # Step 3: Preprocess
    print("\n⚙️  Step 2/3：前處理（過濾台北景點 + 取得天氣）...")
    try:
        context = preprocess(search_result)
        candidates = context.get("candidates", [])
        weather = context.get("weather", {})
        print(f"   → 台北候選景點：{len(candidates)} 個")
        for c in candidates[:5]:
            print(f"     • {c['name']}")
        if len(candidates) > 5:
            print(f"     ... 以及 {len(candidates) - 5} 個")
        print(f"   → 天氣：{weather.get('description', '?')}")
    except Exception:
        print("❌ Preprocess 階段失敗：")
        traceback.print_exc()
        sys.exit(1)

    # Step 4: Plan
    print("\n🤖 Step 3/3：規劃路線（ADK Agent + Gemini 2.5 Flash）...")
    print("   （這步驟需要 30~90 秒，LLM 會呼叫多個工具）")
    try:
        result = asyncio.run(run_planner(context))
        routes = result.get("recommended_routes", [])
        _print_route_summary(routes)
        _save_and_visualize(result, open_browser)
    except Exception:
        print("❌ Planner 階段失敗：")
        traceback.print_exc()

        # 即使規劃失敗，仍存下 search 結果供 debug
        debug_path = "debug_search_result.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(search_result, f, ensure_ascii=False, indent=2)
        print(
            f"\n💾 搜尋結果已存至 {debug_path}（可用 --mode plan 搭配此檔案繼續 debug）"
        )
        sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: enrich（POST /enrich，用 last_result.json）
# ═══════════════════════════════════════════════════════════════════════════════


def run_enrich(open_browser: bool) -> None:
    result_file = Path(OUTPUT_JSON)
    if not result_file.exists():
        print(f"❌ {OUTPUT_JSON} 不存在，請先跑 plan / search / direct 模式")
        sys.exit(1)

    with open(result_file, encoding="utf-8") as f:
        last = json.load(f)

    # 支援 /plan 回傳格式（含 recommended_routes）
    routes = last.get("recommended_routes") or last.get("routes")
    if not routes:
        print(f"❌ {OUTPUT_JSON} 中找不到 recommended_routes，請確認檔案格式")
        sys.exit(1)

    total_places = sum(len(r.get("waypoints", [])) for r in routes)
    print(f"📡 POST /enrich")
    print(f"   路線數：{len(routes)}  景點總數：{total_places}")
    print(f"   每個景點將抓取：5 則最新評論 + 5 則熱門評論 + 最多 10 張照片")
    print("   （預計需要 1~3 分鐘，請稍候...）")

    payload = {"recommended_routes": routes}
    r = httpx.post(f"{BASE_URL}/enrich", json=payload, headers=HEADERS, timeout=600)
    if r.status_code != 200:
        _handle_response_error(r)

    result = r.json()
    run_id = result.get("run_id", "?")
    output_dir = result.get("output_dir", "?")
    print(f"\n✅ Enrichment 完成！")
    print(f"   run_id     = {run_id}")
    print(f"   output_dir = {output_dir}")

    # 統計
    total_photos = 0
    enriched_routes = result.get("routes", {})
    for route_id, route_data in enriched_routes.items():
        places = route_data.get("places", [])
        route_photos = sum(len(p.get("photos", [])) for p in places)
        total_photos += route_photos
        print(f"\n  [{route_id}] {route_data.get('route_name', '')}：")
        for p in places:
            captions = p.get("captions", [])
            photos = p.get("photos", [])
            print(f"    • {p['place_name']}")
            print(f"      字幕：{captions}")
            print(f"      照片：{len(photos)} 張")

    print(f"\n📸 總計下載 {total_photos} 張照片")
    print(f"📄 詳細報告：{output_dir}/enrichment.json")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"💾 完整結果存至 {OUTPUT_JSON}")


# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: smoke（health → search → plan → enrich，含回應驗證）
# ═══════════════════════════════════════════════════════════════════════════════


def run_smoke(query: str, user_id: str | None, open_browser: bool) -> None:
    """
    對所有 API endpoint 依序測試，每步驗證回應結構。
    health → search → plan → enrich
    """
    failed = False

    def check(condition: bool, msg: str) -> None:
        nonlocal failed
        if not condition:
            print(f"   ❌ FAIL: {msg}")
            failed = True
        else:
            vprint(f"   ✓ {msg}")

    # ── 1. health ─────────────────────────────────────────────────────────────
    print("🔍 [1/4] GET /health ...")
    r = httpx.get(f"{BASE_URL}/health", timeout=5)
    check(r.status_code == 200, f"status_code == 200 (got {r.status_code})")
    check(r.json() == {"status": "ok"}, "body == {status: ok}")
    if not failed:
        print("   ✅ health OK")

    if failed:
        print("\n❌ Smoke test 中止")
        return

    # ── 2. search ─────────────────────────────────────────────────────────────
    print(f"\n🔍 [2/4] POST /search (query={query!r}) ...")
    payload: dict = {"query": query}
    if user_id:
        payload["user_id"] = user_id
    r = httpx.post(f"{BASE_URL}/search", json=payload, headers=HEADERS, timeout=180)
    if r.status_code != 200:
        _handle_response_error(r)
    spot_result = r.json()
    check("top_results" in spot_result, "response has top_results")
    check("user_preference" in spot_result, "response has user_preference")
    check(isinstance(spot_result.get("top_results"), list), "top_results is list")
    top_count = len(spot_result.get("top_results", []))
    check(top_count > 0, f"top_results not empty (got {top_count})")
    print(f"   ✅ search OK — {top_count} 筆結果")

    if failed:
        print("\n❌ Smoke test 中止（search 回應不符預期）")
        return

    # ── 3. plan ───────────────────────────────────────────────────────────────
    print("\n🤖 [3/4] POST /plan ...")
    print("   （需要 30~90 秒，LLM 規劃中...）")
    r = httpx.post(f"{BASE_URL}/plan", json=spot_result, headers=HEADERS, timeout=300)
    if r.status_code != 200:
        _handle_response_error(r)
    plan_result = r.json()
    routes = plan_result.get("recommended_routes", [])
    check("recommended_routes" in plan_result, "response has recommended_routes")
    check(isinstance(routes, list), "recommended_routes is list")
    check(len(routes) > 0, f"recommended_routes not empty (got {len(routes)})")
    for route in routes:
        check("waypoints" in route, f"route {route.get('route_id')} has waypoints")
        check("tsp_evaluation" in route, f"route {route.get('route_id')} has tsp_evaluation")
    print(f"   ✅ plan OK — {len(routes)} 條路線")
    _print_route_summary(routes)
    _save_and_visualize(plan_result, open_browser)

    if failed:
        print("\n❌ Smoke test 中止（plan 回應不符預期）")
        return

    # ── 4. enrich ─────────────────────────────────────────────────────────────
    print("\n📸 [4/4] POST /enrich ...")
    total_places = sum(len(route.get("waypoints", [])) for route in routes)
    print(f"   路線數：{len(routes)}  景點總數：{total_places}")
    print("   （每個景點抓取評論 + 照片 + 字幕，預計 1~3 分鐘...）")
    r = httpx.post(
        f"{BASE_URL}/enrich",
        json={"recommended_routes": routes},
        headers=HEADERS,
        timeout=600,
    )
    if r.status_code != 200:
        _handle_response_error(r)
    enrich_result = r.json()
    check("run_id" in enrich_result, "response has run_id")
    check("output_dir" in enrich_result, "response has output_dir")
    check("routes" in enrich_result, "response has routes")
    run_id = enrich_result.get("run_id", "?")
    print(f"   ✅ enrich OK — run_id={run_id}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    if failed:
        print("❌ Smoke test 完成，但有驗證失敗項目（見上方 ❌ FAIL）")
    else:
        print("✅ Smoke test 完成！所有 4 個 API 正常。")


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════════


def main():
    global VERBOSE

    parser = argparse.ArgumentParser(
        description="YTP Planning Agent 本地測試腳本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
模式說明：
  plan    — POST /plan，用 spot_result_v1.json（需要 server）
  search  — POST /search，搜尋景點並存為 SpotResult（需要 server）
  direct  — 直接跑 Python pipeline，不需要 server（最適合 debug）
  enrich  — POST /enrich，對 last_result.json 的路線抓評論 + 照片（需要 server）
  smoke   — 完整測試：health → search → plan → enrich（需要 server）

adk web 說明：
  adk web 只能測試 LLM Agent 本身，無法執行 search / preprocess pipeline。
  如需完整測試，請用 --mode direct 或 --mode search。
        """,
    )
    parser.add_argument(
        "--mode",
        choices=["plan", "search", "direct", "enrich", "smoke"],
        default="plan",
        help="執行模式（預設：plan）",
    )
    parser.add_argument(
        "--query", default="台北美術文青", help="搜尋關鍵字（search / direct 模式用）"
    )
    parser.add_argument(
        "--user",
        default="alice",
        help="使用者 ID（search / direct 模式用，留空則不載入偏好）",
    )
    parser.add_argument("--no-open", action="store_true", help="不自動開啟瀏覽器")
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="顯示詳細的請求 / 回應資訊"
    )
    args = parser.parse_args()

    VERBOSE = args.verbose
    open_browser = not args.no_open

    # enrich / direct 不需要 API key 去 server（direct 完全不用 server）
    if args.mode != "direct" and not API_KEY:
        print("⚠️  YTP_API_KEY 未設定，請在 .env 中設定：YTP_API_KEY=...")
        sys.exit(1)

    # direct mode 不需要 server
    if args.mode == "direct":
        run_direct(
            query=args.query,
            user_id=args.user or None,
            open_browser=open_browser,
        )
        return

    # 其他模式需要 server
    if not check_server():
        print("❌ 找不到伺服器，請先執行：")
        print("   uv run uvicorn main:app --reload")
        sys.exit(1)
    print(f"✅ 伺服器正常 ({BASE_URL})\n")

    if args.mode == "plan":
        run_plan(open_browser=open_browser)
    elif args.mode == "search":
        run_search(
            query=args.query,
            user_id=args.user or None,
            open_browser=open_browser,
        )
    elif args.mode == "enrich":
        run_enrich(open_browser=open_browser)
    elif args.mode == "smoke":
        run_smoke(
            query=args.query,
            user_id=args.user or None,
            open_browser=open_browser,
        )


if __name__ == "__main__":
    main()
