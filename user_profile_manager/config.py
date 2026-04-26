"""
user_profile_manager/config.py — centralised configuration.

REPO_BACKEND controls which storage implementation is used:
  "json"  — JsonUserRepository  (default, uses local JSON files)
  "db"    — DbUserRepository    (future: implement repository/db_repo.py)

To switch to a real database later:
  1. Implement repository/db_repo.py
  2. Set REPO_BACKEND = "db" here (or via env var)
  3. No other files need to change.
"""

import os

# ── Repository backend ────────────────────────────────────────────────────────
# "json" | "db"
REPO_BACKEND: str = os.getenv("PROFILE_REPO_BACKEND", "json")

# ── Storage paths ─────────────────────────────────────────────────────────────
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_DIR  = os.path.join(MODULE_DIR, "users")          # JSON "database"
