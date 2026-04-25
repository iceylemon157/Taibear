"""
user_profile_manager/models.py — UserPreference and Reel data models.

Local copy of the canonical data structures. No external dependencies.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict


@dataclass
class Reel:
    url: str
    text_content: str
    auto_tags: list[str] = field(default_factory=list)


@dataclass
class UserPreference:
    user_id: str = ""
    display_name: str = ""
    country: str = ""
    preferred_languages: list[str] = field(default_factory=list)
    age: int = 0
    preferred_transportation: list[str] = field(default_factory=list)
    selected_tags: list[str] = field(default_factory=list)
    reels: list[Reel] = field(default_factory=list)

    def combined_tags(self) -> list[str]:
        seen = dict.fromkeys(self.selected_tags)
        for reel in self.reels:
            seen.update(dict.fromkeys(reel.auto_tags))
        return list(seen)

    def to_preference_string(self) -> str:
        return "、".join(self.combined_tags())

    def to_dict(self) -> dict:
        return {
            "user_id":                  self.user_id,
            "display_name":             self.display_name,
            "country":                  self.country,
            "preferred_languages":      self.preferred_languages,
            "age":                      self.age,
            "preferred_transportation": self.preferred_transportation,
            "selected_tags":            self.selected_tags,
            "reels":                    [asdict(r) for r in self.reels],
            "combined_tags":            self.combined_tags(),
        }

    @staticmethod
    def from_dict(d: dict) -> UserPreference:
        reels = [Reel(**r) for r in d.get("reels", [])]
        return UserPreference(
            user_id=d.get("user_id", ""),
            display_name=d.get("display_name", ""),
            country=d.get("country", ""),
            preferred_languages=d.get("preferred_languages", []),
            age=d.get("age", 0),
            preferred_transportation=d.get("preferred_transportation", []),
            selected_tags=d.get("selected_tags", []),
            reels=reels,
        )

    @staticmethod
    def load(path: str) -> UserPreference:
        with open(path, encoding="utf-8") as f:
            return UserPreference.from_dict(json.load(f))

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            data = {
                "user_id":                  self.user_id,
                "display_name":             self.display_name,
                "country":                  self.country,
                "preferred_languages":      self.preferred_languages,
                "age":                      self.age,
                "preferred_transportation": self.preferred_transportation,
                "selected_tags":            self.selected_tags,
                "reels":                    [asdict(r) for r in self.reels],
            }
            json.dump(data, f, ensure_ascii=False, indent=2)
