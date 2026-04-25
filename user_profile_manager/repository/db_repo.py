"""
repository/db_repo.py — PostgreSQL-backed UserRepository using SQLAlchemy 2.0.

Stores profiles in a `user_profiles` table in the shared Postgres DB.
The table is created automatically on first connection.

To activate:
    Set PROFILE_REPO_BACKEND=db and PROFILE_DB_URL=postgresql://... in env.
"""

from __future__ import annotations

from sqlalchemy import Boolean, create_engine, Column, Integer, MetaData, Table, Text, select, text
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

_auth_accounts = Table(
    "auth_accounts",
    _metadata,
    Column("user_id", Text, primary_key=True),
    Column("password_hash", Text, nullable=False),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)

_auth_sessions = Table(
    "auth_sessions",
    _metadata,
    Column("session_id", Text, primary_key=True),
    Column("user_id", Text, nullable=False),
    Column("access_token_hash", Text, nullable=False, unique=True),
    Column("refresh_token_hash", Text, nullable=False, unique=True),
    Column("access_expires_at", Text, nullable=False),
    Column("refresh_expires_at", Text, nullable=False),
    Column("revoked", Boolean, nullable=False, server_default=text("false")),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
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

    # ── Auth account methods ─────────────────────────────────────────────────

    def auth_account_exists(self, user_id: str) -> bool:
        stmt = select(_auth_accounts.c.user_id).where(_auth_accounts.c.user_id == user_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).fetchone()
        return row is not None

    def create_auth_account(self, user_id: str, password_hash: str, created_at: str) -> None:
        if self.auth_account_exists(user_id):
            raise ValueError(f"Auth account '{user_id}' already exists.")

        stmt = insert(_auth_accounts).values(
            user_id=user_id,
            password_hash=password_hash,
            created_at=created_at,
            updated_at=created_at,
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_auth_password_hash(self, user_id: str) -> str:
        stmt = select(_auth_accounts.c.password_hash).where(_auth_accounts.c.user_id == user_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).fetchone()
        if row is None:
            raise KeyError(f"Auth account '{user_id}' not found.")
        return str(row[0])

    # ── Auth session methods ─────────────────────────────────────────────────

    def create_auth_session(self, session: dict) -> None:
        stmt = insert(_auth_sessions).values(**session)
        with self._engine.begin() as conn:
            conn.execute(stmt)

    @staticmethod
    def _session_row_to_dict(row) -> dict:
        if row is None:
            return None
        return {
            "session_id": row.session_id,
            "user_id": row.user_id,
            "access_token_hash": row.access_token_hash,
            "refresh_token_hash": row.refresh_token_hash,
            "access_expires_at": row.access_expires_at,
            "refresh_expires_at": row.refresh_expires_at,
            "revoked": bool(row.revoked),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def get_auth_session_by_access_hash(self, access_token_hash: str) -> dict | None:
        stmt = select(_auth_sessions).where(_auth_sessions.c.access_token_hash == access_token_hash)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).fetchone()
        return self._session_row_to_dict(row)

    def get_auth_session_by_refresh_hash(self, refresh_token_hash: str) -> dict | None:
        stmt = select(_auth_sessions).where(_auth_sessions.c.refresh_token_hash == refresh_token_hash)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).fetchone()
        return self._session_row_to_dict(row)

    def rotate_auth_session_tokens(
        self,
        session_id: str,
        access_token_hash: str,
        refresh_token_hash: str,
        access_expires_at: str,
        refresh_expires_at: str,
        updated_at: str,
    ) -> None:
        stmt = (
            _auth_sessions.update()
            .where(_auth_sessions.c.session_id == session_id)
            .values(
                access_token_hash=access_token_hash,
                refresh_token_hash=refresh_token_hash,
                access_expires_at=access_expires_at,
                refresh_expires_at=refresh_expires_at,
                revoked=False,
                updated_at=updated_at,
            )
        )
        with self._engine.begin() as conn:
            result = conn.execute(stmt)
        if result.rowcount == 0:
            raise KeyError(f"Session '{session_id}' not found.")

    def revoke_auth_session_by_access_hash(self, access_token_hash: str, updated_at: str) -> bool:
        stmt = (
            _auth_sessions.update()
            .where(_auth_sessions.c.access_token_hash == access_token_hash)
            .values(revoked=True, updated_at=updated_at)
        )
        with self._engine.begin() as conn:
            result = conn.execute(stmt)
        return result.rowcount > 0

    def revoke_auth_session_by_refresh_hash(self, refresh_token_hash: str, updated_at: str) -> bool:
        stmt = (
            _auth_sessions.update()
            .where(_auth_sessions.c.refresh_token_hash == refresh_token_hash)
            .values(revoked=True, updated_at=updated_at)
        )
        with self._engine.begin() as conn:
            result = conn.execute(stmt)
        return result.rowcount > 0
