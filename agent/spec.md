# 台北一日遊規劃 Agent 技術規格書 (MVP v2.0)

## 1. 系統核心目標
接收檢索系統提供的「預選景點清單 (JSON)」與「使用者偏好 (Sam)」，結合 Google Maps API 與天氣資訊，透過 TSP (旅行推銷員問題) 邏輯優化順序，最終輸出 3 條**可以直接在 Google Maps 上繪製且不繞路**的客製化一日遊路線。

## 2. 系統工作流程 (DAG Pipeline)

整個 Agent 的思考與執行流程應分為以下四個階段 (Step)：

### Step 1: 解析與情境初始化 (Context Initialization)
* **讀取 Input**: 解析傳入的 JSON，提取 `top_results` 內的 `extracted_places`。
* **Persona 解析**: 抓取 Sam 的特徵：`早起`、`文青`、`slow paced`、`cafe`、`玫瑰園`、`bar`。
* **天氣檢查**: 呼叫天氣 API 獲取台北當日天氣（決定備案路線的室內外比例）。

### Step 2: 景點擴充與座標化 (POI Grounding & Expansion)
這一步非常關鍵，因為 Input 只有景點名稱，沒有座標，且缺少 Sam 想要的特定地點。
* **基礎轉換**: 使用 Google Places API (Text Search) 將 `extracted_places` (如：華山1914、里Ura) 轉換為 `Place ID`、`緯度 (Lat)`、`經度 (Lng)` 與 `營業時間`。
* **缺口補足 (Tool Call)**: Agent 發現 Input 缺乏「玫瑰園」與「酒吧」。
    * 觸發 `Google Maps Text Search`: 搜尋 "台北 玫瑰園" (如：新生公園臺北玫瑰園)。
    * 觸發 `Google Maps Text Search`: 搜尋 "台北 文青 酒吧" (如：大稻埕的特色餐酒館)。
* **過濾**: 剔除與「早起 (需早上有開放)」、「慢步調 (剔除行程過於緊湊的地點)」衝突的選項，形成 **候選景點池 (Candidate Pool)**。

### Step 3: 路線生成與 TSP 優化 (Route Generation & TSP Evaluation)
* **組合生成**: LLM 根據 Persona 挑選出 3 組不同的地點組合 (Sets)。因為 Sam 是「slow paced」，每條路線建議只排 **3 ~ 4 個地點** (早、午、晚各一)。
* **順暢度計算 (TSP)**:
    * 將每組的地點座標丟入 Python 的 TSP 演算法模組。
    * 使用 Google Maps Distance Matrix API 計算點與點之間的「大眾運輸/步行時間」。
    * 計算出最短路徑排序 (例如：A -> B -> C，確保沒有 A -> C -> B 的來回繞路)。
    * *時間檢驗*: 檢查 TSP 排出來的順序，是否符合營業時間 (早起先去玫瑰園 -> 下午去 Cafe -> 晚上去 Bar)。

### Step 4: 結構化輸出 (Structured Output)
將排好序的路線格式化為 JSON，並自動生成 Google Maps 導航網址。

---

## 3. 路線設計策略 (針對 Sam 的 3 條路線)

Agent 應確保 3 條路線有不同的情境定調，讓使用者有真實的「選擇權」：

* **路線 A：完美命中型 (The Perfect Match)**
    * *特色*: 完全依照 Sam 的願望清單，且結合 Input 中的景點。
    * *預期路徑*: 臺北玫瑰園 (早起賞花) ➔ [Input] 青春漢堡/CAFE de GEAR (慢步調午餐與咖啡) ➔ [擴充] 中山區文青酒吧。
* **路線 B：老城慢活型 (Old Town Slow Pace)**
    * *特色*: 結合 Input 中提到的「大稻埕」，主打復古文青風。
    * *預期路徑*: 大稻埕碼頭/延平河濱公園 (早起散步) ➔ [Input] 里Ura (老宅咖啡館) ➔ [擴充] 迪化街特色老宅酒吧。
* **路線 C：雨天/室內備案型 (Weather Backup)**
    * *特色*: 如果當天下雨，或是 Sam 想要更靜態的行程。
    * *預期路徑*: 建國花市 (半室內植物/花卉) ➔ [Input] 華山1914文創園區 (看展) ➔ [Input] 附近提供酒類的餐酒館/咖啡廳 (如 Input 提到的 ARKI GALERIA 築空間)。

---

## 4. 系統輸出格式 (Output Spec)

為了讓前端能夠**直接畫在地圖上**，Agent 的最終輸出必須嚴格遵守以下 JSON 結構。這裡面包含了經緯度以及可以直接點擊開啟的 Google Maps 網址。

```json
{
  "recommended_routes": [
    {
      "route_id": "route_A",
      "route_name": "晨光玫瑰與巷弄微醺之旅",
      "theme": "完美符合您的早起與花園偏好，步伐緩慢而優雅",
      "tsp_evaluation": {
        "total_transit_time_mins": 45,
        "smoothness_score": 0.95
      },
      "google_maps_url": "https://www.google.com/maps/dir/?api=1&origin=臺北玫瑰園&destination=中山區文青酒吧&waypoints=CAFE+de+GEAR&travelmode=transit",
      "waypoints": [
        {
          "step_order": 1,
          "name": "臺北玫瑰園 (新生公園)",
          "place_id": "ChIJU6T5H3upQjQRq5G-G9z_...",
          "location": { "lat": 25.0701, "lng": 121.5298 },
          "suggested_time": "08:30 - 11:30",
          "reasoning": "Sam 習慣早起，玫瑰園 24 小時開放且清晨人少最適合慢步調賞花。"
        },
        {
          "step_order": 2,
          "name": "CAFE de GEAR",
          "place_id": "ChIJw_e-q2epQjQRy...",
          "location": { "lat": 25.0345, "lng": 121.5192 },
          "suggested_time": "12:00 - 17:00",
          "reasoning": "從搜尋結果中挑選出的明亮老宅咖啡廳，適合安靜閱讀與享受手沖。"
        },
        {
          "step_order": 3,
          "name": "Bar M",
          "place_id": "ChIJH-...",
          "location": { "lat": 25.0488, "lng": 121.5222 },
          "suggested_time": "19:00 - 21:00",
          "reasoning": "隱藏在巷弄內的文青酒吧，用一杯調酒為慢步調的一天收尾。"
        }
      ]
    }
    // ... route_B, route_C 省略
  ]
}
```

## 5. Google ADK + Python 實作建議
1.  **Tool 定義**: 你需要在 ADK 中清楚定義工具：
    * `geocode_and_get_details(place_names: list)` -> 負責把 Input 轉成座標跟營業時間。
    * `search_nearby_places(keyword: str, location: dict)` -> 負責補足「玫瑰園」、「Bar」。
    * `evaluate_and_sort_route(waypoints: list)` -> 這是你的 Python TSP 邏輯，吃一組地點，吐出最佳排序。
2.  **Prompt 設計**: 告訴 LLM：「你是一個規劃師，請從 Input 和 Tool 找出的地點中，挑選 3 個地點組成一條路線。**挑選完後，必須呼叫 `evaluate_and_sort_route` 來決定這 3 個地點的先後順序**，最後依照排序輸出 JSON。」

這樣設計，輸入端不動，但你的 Agent 可以聰明地「補齊缺少的拼圖」，並且靠 TSP 演算法保證路線順暢，輸出的資料也能直接送到地圖元件上渲染！
