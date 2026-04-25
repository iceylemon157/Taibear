# gmaps_fetcher

Standalone Google Maps hotel info fetcher. No framework coupling — copy the folder into any Python project.

## Setup

```bash
pip install httpx python-dotenv
```

Create a `.env` (or set the env var directly):

```env
GOOGLE_MAPS_API_KEY=your_key_here
```

The GCP key needs these APIs enabled: **Places API**, **Maps JavaScript API** (for photos).

---

## Usage

### Search by name

```python
from gmaps_fetcher import search_by_name

hotel = search_by_name("君悅酒店", region="台北")
# returns full detail dict, or None if not found
print(hotel["name"], hotel["rating"], hotel["address"])
```

### Search by keyword

```python
from gmaps_fetcher import search_by_keyword, get_details

candidates = search_by_keyword("台北 五星飯店", top_k=5)
# returns basic info (place_id, name, address, lat, lng, rating)

# fetch full details for any candidate
hotel = get_details(candidates[0]["place_id"])
```

### Full detail record

```python
from gmaps_fetcher import get_details

hotel = get_details("ChIJxxxxxxxxxx")
# {
#   place_id, name, address, phone, phone_intl,
#   rating, review_count, price_level,  # price_level: 1(cheap)–4(expensive)
#   website, google_maps_url,
#   opening_hours,                       # list of weekday strings
#   lat, lng, types
# }
```

### Reviews

```python
from gmaps_fetcher import fetch_reviews

reviews = fetch_reviews(hotel["place_id"], sort="newest")
# sort: "newest" | "most_relevant"
# returns list of {author, rating, text, time, profile_photo_url}

for r in reviews:
    print(r["rating"], r["text"])
```

### Photos

```python
from gmaps_fetcher import fetch_photo_urls, download_photos
from pathlib import Path

# Option A — get resolved image URLs (no local download)
urls = fetch_photo_urls(hotel["place_id"], max_photos=5)

# Option B — download to disk
saved = download_photos(hotel["place_id"], output_dir=Path("./hotel_photos"), max_photos=10)
# returns list[Path] of saved files
```

---

## File structure

```
gmaps_fetcher/
├── _config.py   ← reads GOOGLE_MAPS_API_KEY from env
├── places.py    ← search_by_name, search_by_keyword, get_details
├── reviews.py   ← fetch_reviews
└── photos.py    ← fetch_photo_urls, download_photos
```
