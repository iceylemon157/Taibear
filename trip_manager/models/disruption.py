"""
trip_manager/models/disruption.py — Disruption alert data model.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class AlertType(str, Enum):
    RAIN         = "rain"
    HEAVY_RAIN   = "heavy_rain"
    CONGESTION   = "congestion"
    VENUE_CLOSED = "venue_closed"


class Severity(str, Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"


@dataclass
class DisruptionAlert:
    alert_type: AlertType
    severity: Severity
    affected_stop_ids: list[str]
    message: str
    raw_data: dict = field(default_factory=dict)
    alert_id: str = ""
    detected_at: str = ""

    def __post_init__(self):
        if not self.alert_id:
            self.alert_id = uuid.uuid4().hex[:10]
        if not self.detected_at:
            self.detected_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "alert_id":          self.alert_id,
            "alert_type":        self.alert_type.value,
            "severity":          self.severity.value,
            "affected_stop_ids": self.affected_stop_ids,
            "message":           self.message,
            "raw_data":          self.raw_data,
            "detected_at":       self.detected_at,
        }

    @staticmethod
    def from_dict(d: dict) -> DisruptionAlert:
        return DisruptionAlert(
            alert_id=d.get("alert_id", ""),
            alert_type=AlertType(d.get("alert_type", "rain")),
            severity=Severity(d.get("severity", "low")),
            affected_stop_ids=d.get("affected_stop_ids", []),
            message=d.get("message", ""),
            raw_data=d.get("raw_data", {}),
            detected_at=d.get("detected_at", ""),
        )
