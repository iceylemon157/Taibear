import sys
import os
from pathlib import Path

# Allow importing agent config when running inside the agent package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import config
    GOOGLE_MAPS_API_KEY: str = config.GOOGLE_MAPS_API_KEY
except Exception:
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo"
