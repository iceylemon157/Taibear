import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo"
