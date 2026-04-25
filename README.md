# Taibear

Taipei hotel recommender that combines official Taiwan tourism data with Google Maps reviews and AI-generated hashtags. Given a location and personal interest hashtags, returns the top hotels nearby.

## Pipeline

1. **`hotel_get_google.py`** — loads Taiwan's HotelList, filters to Taipei, enriches each hotel with Google Maps data (Chinese name, address, ratings, reviews, photos) and Gemini-generated hashtags. Output: `Taipei_Hotel_with_hashtag.json`. Resumable — re-running picks up where it stopped.
2. **`hotel_recommendation.py`** — given a location string and user hashtags, geocodes the location, finds nearest hotels in the enriched JSON, and re-ranks by hashtag overlap.

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

Create `.env` at the project root:

```env
GOOGLE_MAPS_API_KEY=your_maps_key
GEMINI_API_KEY=your_gemini_key
```

- **Maps key**: enable the legacy **Places API** in Google Cloud and attach an active billing account.
- **Gemini key**: free at https://aistudio.google.com/app/apikey.

## Usage

### Enrich the hotel list

```bash
uv run python hotel_get_google.py
```

The Hotel-json source data is not included in this repo. Place `HotelList.json` under `Hotel-json/` (download from [Taiwan tourism open data](https://data.gov.tw/) or use your own equivalent).

### Get recommendations

Edit the `location` and `hashtags` at the bottom of `hotel_recommendation.py`, then:

```bash
uv run python hotel_recommendation.py
```

Output: `recommendations.json` (top 5 hotels with name, rating, hashtags, address, link, image).

## Project structure

```
.
├── gmaps_fetcher/              # Google Maps API client (search, reviews, photos)
├── hotel.ipynb                 # Exploration notebook
├── hotel_get_google.py         # Enrichment pipeline
├── hotel_recommendation.py     # Recommender
└── Taipei_Hotel_with_hashtag.json  # Enriched data (regenerate with hotel_get_google.py)
```
