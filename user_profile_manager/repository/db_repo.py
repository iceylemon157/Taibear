"""
repository/db_repo.py — PostgreSQL-backed UserRepository using SQLAlchemy 2.0.

Stores profiles in a `user_profiles` table in the shared Postgres DB.
The table is created automatically on first connection.

To activate:
    Set PROFILE_REPO_BACKEND=db and PROFILE_DB_URL=postgresql://... in env.
"""

from __future__ import annotations

from sqlalchemy import create_engine, Column, Integer, MetaData, Table, Text, select, text
from sqlalchemy.dialects.postgresql import JSONB, insert

from .base import UserRepository

_metadata = MetaData()

_user_profiles = Table(
    "user_profiles",
    _metadata,
    Column("user_id", Text, primary_key=True),
    Column("display_name", Text, nullable=False, default=""),
    Column("country", Text, nullable=False, default=""),
    Column("preferred_languages", JSONB, nullable=False, server_default=text("'[]'")),
    Column("age", Integer, nullable=False, default=0),
    Column("preferred_transportation", JSONB, nullable=False, server_default=text("'[]'")),
    Column("selected_tags", JSONB, nullable=False, server_default=text("'[]'")),
    Column("reels", JSONB, nullable=False, server_default=text("'[]'")),
)


class DbUserRepository(UserRepository):

    def __init__(self, connection_string: str = ""):
        if not connection_string:
            raise ValueError("PROFILE_DB_URL must be set when PROFILE_REPO_BACKEND=db")
        self._engine = create_engine(connection_string)
        _metadata.create_all(self._engine)

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_pref(row):
        from models import UserPreference, Reel  # bare import — WORKDIR is the package

        return UserPreference(
            user_id=row.user_id,
            display_name=row.display_name or "",
            country=row.country or "",
            preferred_languages=list(row.preferred_languages or []),
            age=int(row.age or 0),
            preferred_transportation=list(row.preferred_transportation or []),
            selected_tags=list(row.selected_tags or []),
            reels=[Reel(**r) for r in (row.reels or [])],
        )

    @staticmethod
    def _pref_to_values(pref) -> dict:
        return {
            "user_id": pref.user_id,
            "display_name": pref.display_name,
            "country": pref.country,
            "preferred_languages": pref.preferred_languages,
            "age": pref.age,
            "preferred_transportation": pref.preferred_transportation,
            "selected_tags": pref.selected_tags,
            "reels": [
                {"url": r.url, "text_content": r.text_content, "auto_tags": r.auto_tags}
                for r in pref.reels
            ],
        }

    # ── UserRepository interface ──────────────────────────────────────────────

    def get(self, user_id: str):
        stmt = select(_user_profiles).where(_user_profiles.c.user_id == user_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).fetchone()
        if row is None:
            raise KeyError(f"User '{user_id}' not found.")
        return self._row_to_pref(row)

    def save(self, pref) -> None:
        values = self._pref_to_values(pref)
        # upsert: insert or update all fields on conflict
        stmt = (
            insert(_user_profiles)
            .values(**values)
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_={k: v for k, v in values.items() if k != "user_id"},
            )
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def delete(self, user_id: str) -> None:
        stmt = _user_profiles.delete().where(_user_profiles.c.user_id == user_id)
        with self._engine.begin() as conn:
            result = conn.execute(stmt)
        if result.rowcount == 0:
            raise KeyError(f"User '{user_id}' not found.")

    def list_all(self) -> list[str]:
        stmt = select(_user_profiles.c.user_id).order_by(_user_profiles.c.user_id)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).fetchall()
        return [row[0] for row in rows]
