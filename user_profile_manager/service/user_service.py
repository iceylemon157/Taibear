"""
service/user_service.py — Business-logic layer for user profile management.

Sits between the repository (storage) and the interface (console / API).
All mutation methods validate inputs before delegating to the repository.
"""

from __future__ import annotations

# fmt: off
SUGGESTED_TAGS: list[str] = [
    # atmosphere / vibe
    "文青", "安靜", "熱鬧", "浪漫", "復古", "工業風", "木質風格", "ins打卡",
    # activities
    "適合工作", "適合讀書", "適合聚會", "適合約會", "遛狗友善", "寵物友善",
    # mobility / accessibility
    "步行為主", "捷運可達", "有停車場", "無障礙",
    # food & drink
    "咖啡廳", "甜點", "蛋糕", "輕食", "素食友善", "調酒", "茶館",
    # budget
    "預算低", "預算中等", "預算高",
    # nature / outdoors
    "公園", "海景", "山景", "戶外座位",
    # cultural
    "藝術展覽", "書店", "獨立書店", "音樂表演",
]
# fmt: on


class UserService:

    def __init__(self, repo):
        self._repo = repo

    # ── Read operations ───────────────────────────────────────────────────────

    def get_user(self, user_id: str):
        """Return UserPreference or raise KeyError."""
        return self._repo.get(user_id)

    def list_users(self) -> list[str]:
        """Return sorted list of all user_ids."""
        return self._repo.list_all()

    # ── Create ────────────────────────────────────────────────────────────────

    def create_user(
        self,
        user_id: str,
        display_name: str,
        country: str = "",
        preferred_languages: list[str] | None = None,
        age: int = 0,
        preferred_transportation: list[str] | None = None,
        selected_tags: list[str] | None = None,
    ):
        """
        Create a new user profile.
        Raises ValueError if user_id is empty or already exists.
        """
        from models import UserPreference  # noqa: PLC0415

        user_id = user_id.strip()
        if not user_id:
            raise ValueError("user_id must not be empty.")
        if user_id in self._repo.list_all():
            raise ValueError(f"User '{user_id}' already exists.")

        pref = UserPreference(
            user_id=user_id,
            display_name=display_name.strip(),
            country=country.strip(),
            preferred_languages=list(preferred_languages or []),
            age=age,
            preferred_transportation=list(preferred_transportation or []),
            selected_tags=list(selected_tags or []),
        )
        self._repo.save(pref)
        return pref

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_user(self, user_id: str) -> None:
        """Delete a user profile.  Raises KeyError if not found."""
        self._repo.delete(user_id)

    # ── Update (partial) ──────────────────────────────────────────────────────

    def update_user(self, user_id: str, **fields):
        """
        Partial update of a user profile.
        Accepted keyword args: display_name, country, preferred_languages,
        age, preferred_transportation, selected_tags.
        Raises KeyError if user not found.
        """
        pref = self._repo.get(user_id)
        for key in ("display_name", "country", "preferred_languages",
                     "age", "preferred_transportation", "selected_tags"):
            if key in fields:
                setattr(pref, key, fields[key])
        self._repo.save(pref)
        return pref

    # ── Tag management ────────────────────────────────────────────────────────

    def add_tag(self, user_id: str, tag: str) -> None:
        """Append *tag* to selected_tags if not already present."""
        tag = tag.strip()
        if not tag:
            raise ValueError("Tag must not be empty.")
        pref = self._repo.get(user_id)
        if tag not in pref.selected_tags:
            pref.selected_tags.append(tag)
            self._repo.save(pref)

    def remove_tag(self, user_id: str, tag: str) -> None:
        """Remove *tag* from selected_tags.  Raises ValueError if not found."""
        pref = self._repo.get(user_id)
        if tag not in pref.selected_tags:
            raise ValueError(f"Tag '{tag}' not in profile.")
        pref.selected_tags.remove(tag)
        self._repo.save(pref)

    def update_tags(self, user_id: str, tags: list[str]) -> None:
        """Replace the entire selected_tags list."""
        pref = self._repo.get(user_id)
        pref.selected_tags = list(tags)
        self._repo.save(pref)

    # ── Reel management ───────────────────────────────────────────────────────

    def add_reel(self, user_id: str, url: str, text_content: str) -> None:
        """Append a new reel.  Raises ValueError if URL already present."""
        from models import Reel  # noqa: PLC0415

        url = url.strip()
        if not url:
            raise ValueError("Reel URL must not be empty.")
        pref = self._repo.get(user_id)
        if any(r.url == url for r in pref.reels):
            raise ValueError(f"Reel URL already in profile: {url}")
        pref.reels.append(Reel(url=url, text_content=text_content.strip()))
        self._repo.save(pref)

    def remove_reel(self, user_id: str, url: str) -> None:
        """Remove the reel with the given URL.  Raises ValueError if not found."""
        pref = self._repo.get(user_id)
        original_len = len(pref.reels)
        pref.reels = [r for r in pref.reels if r.url != url]
        if len(pref.reels) == original_len:
            raise ValueError(f"Reel '{url}' not found in profile.")
        self._repo.save(pref)
