"""
Google Places — photo fetching.

Public API:
    fetch_photo_urls(place_id, max_photos, max_width)  → list[str]  (redirect URLs)
    download_photos(place_id, output_dir, ...)          → list[Path] (saved files)
"""

from __future__ import annotations

from pathlib import Path

import httpx

from ._config import GOOGLE_MAPS_API_KEY, PLACES_BASE, PHOTO_BASE


def fetch_photo_references(place_id: str, max_photos: int = 10) -> list[str]:
    """Return raw photo_reference tokens for a place_id."""
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": "photos",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        photos = resp.json().get("result", {}).get("photos", [])[:max_photos]
        return [p["photo_reference"] for p in photos if p.get("photo_reference")]
    except Exception as e:
        print(f"[gmaps_fetcher] ⚠ fetch_photo_references({place_id!r}): {e}")
        return []


def fetch_photo_urls(
    place_id: str,
    max_photos: int = 10,
    max_width: int = 1200,
) -> list[str]:
    """
    Return resolved photo URLs (after following the 302 redirect).
    Useful when you want the URL rather than downloading the file.

    Returns:
        list of image URLs (may be shorter than max_photos if some fail)
    """
    refs = fetch_photo_references(place_id, max_photos)
    urls: list[str] = []
    for ref in refs:
        params = {"maxwidth": max_width, "photo_reference": ref, "key": GOOGLE_MAPS_API_KEY}
        try:
            resp = httpx.get(PHOTO_BASE, params=params, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            urls.append(str(resp.url))
        except Exception as e:
            print(f"[gmaps_fetcher] ⚠ fetch_photo_urls (ref={ref[:20]}…): {e}")
    return urls


def download_photos(
    place_id: str,
    output_dir: str | Path,
    max_photos: int = 10,
    max_width: int = 1200,
) -> list[Path]:
    """
    Download photos for a place into output_dir.

    Args:
        place_id:   Google Places place_id
        output_dir: Directory to save images (created if needed)
        max_photos: Max number of photos to download
        max_width:  Requested image width in pixels

    Returns:
        list of Path objects for successfully saved files
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    refs = fetch_photo_references(place_id, max_photos)
    saved: list[Path] = []

    for i, ref in enumerate(refs, start=1):
        dest = output_dir / f"photo_{i:02d}.jpg"
        params = {"maxwidth": max_width, "photo_reference": ref, "key": GOOGLE_MAPS_API_KEY}
        try:
            resp = httpx.get(PHOTO_BASE, params=params, timeout=20, follow_redirects=True)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
            saved.append(dest)
        except Exception as e:
            print(f"[gmaps_fetcher] ⚠ download_photos photo_{i:02d}: {e}")

    print(f"[gmaps_fetcher] 照片：{len(saved)}/{len(refs)} 張儲存至 {output_dir}")
    return saved
