"""
路線視覺化工具

用法：
  uv run python visualize.py output.json
  uv run python visualize.py output.json --open   # 自動開瀏覽器
"""

import argparse
import json
import urllib.parse
import webbrowser
from pathlib import Path

import folium
from folium import plugins

ROUTE_COLORS = {
    "route_A": "#E74C3C",   # 紅
    "route_B": "#2980B9",   # 藍
    "route_C": "#27AE60",   # 綠
}

ROUTE_LABELS = {
    "route_A": "A",
    "route_B": "B",
    "route_C": "C",
}

STEP_ICONS = ["①", "②", "③", "④", "⑤"]


def rebuild_maps_url(waypoints: list[dict]) -> str:
    """lat,lng 座標で Google Maps URL を再構築。名前や place_id に依存しない。"""
    if not waypoints:
        return ""

    def point(wp: dict) -> str:
        loc = wp.get("location", {})
        lat = loc.get("lat")
        lng = loc.get("lng")
        if lat is not None and lng is not None:
            return f"{lat},{lng}"
        return urllib.parse.quote(wp["name"])

    origin = point(waypoints[0])
    destination = point(waypoints[-1])
    url = (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={origin}&destination={destination}&travelmode=transit"
    )
    if len(waypoints) > 2:
        middle = "|".join(point(w) for w in waypoints[1:-1])
        url += f"&waypoints={middle}"
    return url


def make_marker_html(step: int, color: str, route_label: str) -> str:
    """產生帶數字的圓形標記 HTML。"""
    return f"""
    <div style="
        background-color: {color};
        color: white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: bold;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        font-family: sans-serif;
    ">{route_label}{step}</div>
    """


def make_popup_html(waypoint: dict, route_name: str, color: str) -> str:
    """產生 popup 卡片 HTML。"""
    return f"""
    <div style="min-width:220px; font-family:sans-serif; font-size:13px;">
        <div style="background:{color}; color:white; padding:6px 10px; border-radius:4px 4px 0 0; font-weight:bold;">
            {route_name}
        </div>
        <div style="padding:10px; border:1px solid #eee; border-top:none; border-radius:0 0 4px 4px;">
            <div style="font-size:15px; font-weight:bold; margin-bottom:4px;">
                {STEP_ICONS[waypoint['step_order'] - 1]} {waypoint['name']}
            </div>
            <div style="color:#555; margin-bottom:6px;">🕐 {waypoint['suggested_time']}</div>
            <div style="color:#444; line-height:1.5;">{waypoint['reasoning']}</div>
            <div style="margin-top:8px;">
                <a href="https://www.google.com/maps/place/?q=place_id:{waypoint['place_id']}"
                   target="_blank"
                   style="color:{color}; text-decoration:none; font-size:12px;">
                    📍 在 Google Maps 開啟
                </a>
            </div>
        </div>
    </div>
    """


def make_legend_html(routes: list[dict]) -> str:
    """產生浮動圖例。"""
    items = ""
    for route in routes:
        route_id = route["route_id"]
        color = ROUTE_COLORS.get(route_id, "#888")
        label = ROUTE_LABELS.get(route_id, route_id)
        items += f"""
        <div style="display:flex; align-items:center; margin-bottom:8px;">
            <div style="width:12px; height:12px; background:{color}; border-radius:50%; margin-right:8px; flex-shrink:0;"></div>
            <div>
                <strong>路線 {label}</strong>：{route['route_name']}<br>
                <span style="color:#666; font-size:11px;">{route['theme'][:30]}...</span>
            </div>
        </div>
        """
    return f"""
    <div style="
        position: fixed;
        bottom: 30px;
        left: 30px;
        z-index: 1000;
        background: white;
        padding: 14px 16px;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        font-family: sans-serif;
        font-size: 13px;
        max-width: 320px;
    ">
        <div style="font-weight:bold; margin-bottom:10px; font-size:14px;">🗺 台北一日遊路線</div>
        {items}
    </div>
    """


def visualize(data: dict, output_path: str = "routes_map.html") -> str:
    """將路線資料渲染為互動地圖 HTML 檔案。"""
    routes = data.get("recommended_routes", [])
    if not routes:
        raise ValueError("No routes found in data")

    # 計算地圖中心（所有 waypoints 的平均座標）
    all_lats, all_lngs = [], []
    for route in routes:
        for wp in route.get("waypoints", []):
            all_lats.append(wp["location"]["lat"])
            all_lngs.append(wp["location"]["lng"])

    center_lat = sum(all_lats) / len(all_lats)
    center_lng = sum(all_lngs) / len(all_lngs)

    m = folium.Map(
        location=[center_lat, center_lng],
        zoom_start=14,
        tiles="CartoDB positron",
    )

    # 每條路線畫線 + 標記
    for route in routes:
        route_id = route["route_id"]
        color = ROUTE_COLORS.get(route_id, "#888")
        label = ROUTE_LABELS.get(route_id, route_id)
        waypoints = route.get("waypoints", [])

        # 畫路線折線
        coords = [[wp["location"]["lat"], wp["location"]["lng"]] for wp in waypoints]
        if len(coords) > 1:
            folium.PolyLine(
                locations=coords,
                color=color,
                weight=3,
                opacity=0.8,
                dash_array="8 4",
                tooltip=f"路線 {label}：{route['route_name']}",
            ).add_to(m)

        # 每個 waypoint 加 marker
        for wp in waypoints:
            lat = wp["location"]["lat"]
            lng = wp["location"]["lng"]

            icon = folium.DivIcon(
                html=make_marker_html(wp["step_order"], color, label),
                icon_size=(36, 36),
                icon_anchor=(18, 18),
            )

            popup_html = make_popup_html(wp, route["route_name"], color)
            popup = folium.Popup(folium.Html(popup_html, script=True), max_width=280)

            folium.Marker(
                location=[lat, lng],
                icon=icon,
                popup=popup,
                tooltip=f"[{label}{wp['step_order']}] {wp['name']} | {wp['suggested_time']}",
            ).add_to(m)

    # 加圖例
    legend_html = make_legend_html(routes)
    m.get_root().html.add_child(folium.Element(legend_html))

    # 加 Google Maps 連結按鈕
    links_html = '<div style="position:fixed; top:10px; right:10px; z-index:1000; font-family:sans-serif;">'
    for route in routes:
        route_id = route["route_id"]
        color = ROUTE_COLORS.get(route_id, "#888")
        label = ROUTE_LABELS.get(route_id, route_id)
        maps_url = rebuild_maps_url(route.get("waypoints", []))
        links_html += f"""
        <a href="{maps_url}" target="_blank"
           style="display:block; background:{color}; color:white; padding:6px 12px;
                  border-radius:4px; text-decoration:none; font-size:12px;
                  margin-bottom:4px; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.3);">
            🚌 路線 {label} 在 Google Maps 導航
        </a>"""
    links_html += "</div>"
    m.get_root().html.add_child(folium.Element(links_html))

    m.save(output_path)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="台北一日遊路線視覺化")
    parser.add_argument("input", help="路線 JSON 檔案路徑")
    parser.add_argument("--output", default="routes_map.html", help="輸出 HTML 路徑")
    parser.add_argument("--open", action="store_true", help="完成後自動開啟瀏覽器")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    output = visualize(data, args.output)
    print(f"✅ 地圖已儲存：{output}")

    if args.open:
        webbrowser.open(f"file://{Path(output).resolve()}")
        print("🌐 已在瀏覽器開啟")


if __name__ == "__main__":
    main()
