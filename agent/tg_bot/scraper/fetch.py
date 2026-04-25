import os
import re
import httpx
import yt_dlp

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "..", "cookies.txt")

YT_VIDEO_ID_RE = re.compile(
    r"(?:youtube\.com/shorts/|youtu\.be/|youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})"
)

# Mimic an iPhone browser to access public IG pages without login
_IG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_youtube(url: str) -> dict:
    """Use YouTube Data API v3 — reliable, no cookies needed."""
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        raise RuntimeError("YOUTUBE_API_KEY not set")

    m = YT_VIDEO_ID_RE.search(url)
    if not m:
        raise ValueError(f"Cannot extract YouTube video ID from: {url}")
    video_id = m.group(1)

    resp = httpx.get(
        "https://www.googleapis.com/youtube/v3/videos",
        params={"id": video_id, "part": "snippet", "key": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        raise ValueError(f"YouTube API returned no results for video ID: {video_id}")

    snippet = items[0]["snippet"]
    return {
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "tags": snippet.get("tags", []),
        "uploader": snippet.get("channelTitle", ""),
        "webpage_url": url,
        "checkin": "",
    }


def _parse_ig_html(html: str, url: str) -> dict:
    """Extract metadata from Instagram's og meta tags."""
    def og(prop):
        m = re.search(rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']*)["\']', html)
        if not m:
            m = re.search(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:{prop}["\']', html)
        return m.group(1) if m else ""

    raw_title = og("title")       # e.g. "joannelin__ on Instagram: ..."  or just username
    description = og("description")  # actual caption text

    # og:title on IG is usually "username on Instagram: caption..."
    # Strip the boilerplate prefix to get a cleaner title
    caption_from_title = re.sub(r"^.+? on Instagram:\s*", "", raw_title).strip()

    # Use the longer of the two as the content source for LLM
    title = caption_from_title or raw_title

    # Extract hashtags from description as tags
    tags = re.findall(r"#(\w+)", description)

    return {
        "title": title,
        "description": description,
        "tags": tags,
        "uploader": re.search(r"^([^@\s]+)", raw_title).group(1) if raw_title else "",
        "webpage_url": url,
        "checkin": "",
    }


def fetch_instagram_apify(url: str) -> dict:
    """Use Apify Instagram Reel Scraper API."""
    api_token = os.environ.get("APIFY_TOKEN")
    if not api_token:
        raise RuntimeError("APIFY_TOKEN not set")

    # apify/instagram-scraper accepts direct reel URLs without requiring username
    resp = httpx.post(
        "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
        params={"token": api_token},
        json={"directUrls": [url]},
        timeout=60,
    )
    resp.raise_for_status()
    items = resp.json()
    if not items:
        raise ValueError("Apify returned no results")

    item = items[0]
    caption = item.get("caption") or ""
    hashtags = item.get("hashtags") or []          # Apify returns a list directly
    if not hashtags:
        hashtags = re.findall(r"#(\w+)", caption)  # fallback: parse from caption
    first_line = caption.split("\n")[0].strip()

    return {
        "title": first_line or item.get("ownerUsername", ""),
        "description": caption,
        "tags": hashtags,
        "uploader": item.get("ownerUsername", ""),
        "webpage_url": item.get("url", url),
        "checkin": item.get("locationName") or "",
    }


def fetch_instagram(url: str) -> dict:
    """
    Primary: Apify Instagram Reel Scraper (no login needed, stable).
    Fallback: yt-dlp with cookies.txt.
    """
    apify_token = os.environ.get("APIFY_TOKEN")
    if apify_token:
        try:
            return fetch_instagram_apify(url)
        except Exception:
            pass  # fall through to yt-dlp

    # Fallback: yt-dlp with cookies
    cookies_path = os.path.abspath(COOKIES_FILE)
    if not os.path.exists(cookies_path):
        raise RuntimeError("無法取得 Instagram 資料：請設定 APIFY_TOKEN 或提供 cookies.txt")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "cookiefile": cookies_path,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    description = info.get("description", "") or ""
    checkin = info.get("location") or info.get("location_name") or ""
    raw_title = info.get("title", "") or ""
    if raw_title.lower().startswith("video by"):
        title = description.split("\n")[0].strip() or raw_title
    else:
        title = raw_title

    return {
        "title": title,
        "description": description,
        "tags": info.get("tags", []),
        "uploader": info.get("uploader", ""),
        "webpage_url": info.get("webpage_url", url),
        "checkin": checkin,
    }


def fetch_metadata(url: str) -> dict:
    if "youtube.com" in url or "youtu.be" in url:
        return fetch_youtube(url)
    elif "instagram.com" in url:
        return fetch_instagram(url)
    else:
        raise ValueError(f"Unsupported URL: {url}")
