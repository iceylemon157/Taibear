"""
realtime_monitor/fetchers/traffic.py — TDX traffic data fetcher (stub).

TODO: Implement once TDX credentials are configured and the specific
endpoint for Taipei road segment speeds is confirmed.

TDX docs: https://tdx.transportdata.tw/
Expected endpoint: /v2/Road/Traffic/Live/City/Taipei
"""

from __future__ import annotations

from typing import Any

from .base import DataFetcher


class TrafficFetcher(DataFetcher):

    def __init__(self, client_id: str = "", client_secret: str = ""):
        self._client_id = client_id
        self._client_secret = client_secret

    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        raise NotImplementedError(
            "TDX traffic fetcher not yet implemented. "
            "Set TDX_CLIENT_ID and TDX_CLIENT_SECRET, then implement this method."
        )
