import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from google import genai
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gmaps_fetcher import search_with_status, fetch_reviews, fetch_photo_urls

# --- config ---------------------------------------------------------------

load_dotenv(ROOT / '.env')

INPUT_PATH = ROOT / 'Hotel-json' / 'HotelList.json'
OUTPUT_PATH = ROOT / 'data' / 'Taipei_Hotel_with_hashtag.json'
SAMPLE = None  # set to None to run all rows

DROP_COLUMNS = [
    'AlternateNames', 'Description', 'Geometry', 'HotelStars', 'TaiwanHost',
    'HotelCertificationMarks', 'Images', 'ServiceTimeInfo', 'TrafficInfo',
    'Facilities', 'PaymentMethods', 'LocatedCities', 'ReservationURLs',
    'MapURLs', 'SameAsURLs', 'SocialMediaURLs', 'RoomInfo', 'CheckTimes',
    'Remarks', 'UpdateTime', 'Toilets', 'LiftingEquipments',
    'HotelClasses', 'Telephones', 'Organizations', 'ParkingInfo',
    'ServiceStatus', 'WebsiteURL', 'ServiceInfo', 'TotalRooms',
    'LowestPrice', 'CeilingPrice', 'TotalCapacity', 'AccessibleRooms',
    'ParkingSpaces',
    'PostalAddress.City', 'PostalAddress.CityCode', 'PostalAddress.Town',
    'PostalAddress.TownCode', 'PostalAddress.ZipCode',
    'PostalAddress.StreetAddress',
]

gemini = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

# --- helpers --------------------------------------------------------------

def load_taipei_hotels(path: str) -> pd.DataFrame:
    with open(path, encoding='utf-8-sig') as f:
        data = json.load(f)
    df = pd.json_normalize(data['Hotels'])
    df = df[df['HotelLicenseNumber'].str.contains('臺北市', na=False)]
    return df.drop(columns=DROP_COLUMNS)


def enrich(row) -> pd.Series:
    place, status = search_with_status(row['HotelName'], region='台北')
    if not place or not place.get('place_id'):
        return pd.Series({
            'chinese_name': None,
            'chinese_address': None,
            'gmaps_url': None,
            'rating': None,
            'review_count': None,
            'review_summary': None,
            'top_pics': None,
            'enrich_status': status,
        })

    pid = place['place_id']
    reviews = fetch_reviews(pid, sort='most_relevant')
    top_reviews = [r for r in reviews if r.get('rating', 0) >= 4]
    summary = ' | '.join(
        r['text'] for r in top_reviews[:5] if r.get('text')
    ) or None
    pics = fetch_photo_urls(pid, max_photos=3)

    return pd.Series({
        'chinese_name': place.get('name'),
        'chinese_address': place.get('address'),
        'gmaps_url': place.get('google_maps_url'),
        'rating': place.get('rating'),
        'review_count': place.get('review_count'),
        'review_summary': summary,
        'enrich_status': 'OK',
        'top_pics': pics or None,
    })


def generate_hashtags(summary: Optional[str]) -> Optional[str]:
    if not summary:
        return None
    prompt = (
        "以下是某間飯店的評論摘要。請產生 3 個繁體中文 hashtag（用 # 開頭，"
        "用空格分隔），描述這間飯店的特色或氛圍。僅輸出 hashtag，不要其他文字：\n\n"
        f"{summary}"
    )
    for attempt in range(2):
        try:
            resp = gemini.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return resp.text.strip() if resp.text else None
        except Exception as e:
            if attempt == 0:
                time.sleep(5)
                continue
            print(f'  hashtag failed: {type(e).__name__}: {e}', flush=True)
            return None


# --- main -----------------------------------------------------------------

ENRICH_COLS = [
    'chinese_name', 'chinese_address', 'gmaps_url', 'rating',
    'review_count', 'review_summary', 'top_pics', 'hashtags',
    'enrich_status',
]
CHECKPOINT_EVERY = 20


def main() -> None:
    if os.path.exists(OUTPUT_PATH):
        df = pd.read_json(OUTPUT_PATH)
        print(f'resuming: loaded {len(df)} rows from {OUTPUT_PATH}')
    else:
        df = load_taipei_hotels(INPUT_PATH)
        if SAMPLE is not None:
            df = df.head(SAMPLE).copy()
        print(f'fresh start: {len(df)} hotels')

    for col in ENRICH_COLS:
        if col not in df.columns:
            df[col] = pd.Series(dtype='object')

    # Pending = no chinese_name AND not a settled "no match" status
    settled_misses = {'ZERO_RESULTS', 'NO_PLACE_ID'}
    needs = df['chinese_name'].isna() & ~df['enrich_status'].isin(settled_misses)
    pending = df.index[needs].tolist()
    print(f'pending: {len(pending)} of {len(df)}')
    if not pending:
        print('all rows already enriched')
        return

    for i, idx in enumerate(tqdm(pending, desc='Enriching')):
        row = df.loc[idx]
        enriched = enrich(row)
        for col, val in enriched.items():
            df.at[idx, col] = val
        df.at[idx, 'hashtags'] = generate_hashtags(df.at[idx, 'review_summary'])

        if (i + 1) % CHECKPOINT_EVERY == 0:
            df.to_json(OUTPUT_PATH, orient='records', force_ascii=False, indent=2)

    df.to_json(OUTPUT_PATH, orient='records', force_ascii=False, indent=2)
    print(f'done: {len(pending)} newly enriched, {len(df)} total in {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
