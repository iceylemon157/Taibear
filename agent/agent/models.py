"""
agent/models.py — UserPreference 與 Reel 資料模型（唯一真相來源）

Pydantic BaseModel — 同時服務 API schema 層（schemas.py import）與內部 pipeline。
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel


class Reel(BaseModel):
    url: str
    text_content: str
    auto_tags: list[str] = []


class UserPreference(BaseModel):
    user_id: str = ""
    display_name: str = ""
    selected_tags: list[str] = []
    reels: list[Reel] = []

    def combined_tags(self) -> list[str]:
        """合併 selected_tags + 所有 reel auto_tags，去重並保留順序。"""
        seen = dict.fromkeys(self.selected_tags)
        for reel in self.reels:
            seen.update(dict.fromkeys(reel.auto_tags))
        return list(seen)

    def to_preference_string(self) -> str:
        """以純字串形式回傳所有偏好標籤，用於 LLM prompt。"""
        return "、".join(self.combined_tags())

    def save(self, path: str | Path) -> None:
        """將 UserPreference 寫回 JSON 檔案。"""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.model_dump(), f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path: str | Path) -> "UserPreference":
        """從 JSON 檔案載入 UserPreference。"""
        with open(path, encoding="utf-8") as f:
            return cls.model_validate(json.load(f))


# ═══════════════════════════════════════════════════════════════════════════════
#  User Registry
# ═══════════════════════════════════════════════════════════════════════════════


def list_users(users_dir: str | Path) -> list[str]:
    """回傳 users_dir 中所有使用者的 user_id。"""
    users_dir = Path(users_dir)
    if not users_dir.is_dir():
        return []
    return sorted(
        f.stem
        for f in users_dir.iterdir()
        if f.suffix == ".json" and not f.name.startswith("_")
    )


def load_user(user_id: str, users_dir: str | Path) -> tuple[UserPreference, str]:
    """
    從 users_dir/<user_id>.json 載入使用者偏好。

    Returns:
        (UserPreference, 檔案路徑字串)

    Raises:
        FileNotFoundError: 找不到對應的使用者檔案
    """
    users_dir = Path(users_dir)
    path = users_dir / f"{user_id}.json"
    if not path.exists():
        available = list_users(users_dir)
        raise FileNotFoundError(
            f"找不到使用者 '{user_id}' 的偏好檔案：{path}\n現有使用者：{available}"
        )
    return UserPreference.load(path), str(path)
