"""
user_profile_manager/main.py — Entry point for the User Profile Manager.

Usage:
    # API mode (default) — starts FastAPI server on port 8004
    python -m user_profile_manager.main
    python -m user_profile_manager.main --port 9000

    # Console mode — interactive CLI
    python -m user_profile_manager.main --console

    # Or from the module directory:
    python main.py
"""

import argparse
import sys
import os

# ── Ensure this module's parent is on sys.path so relative imports work ───────
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
if _MODULE_DIR not in sys.path:
    sys.path.insert(0, _MODULE_DIR)

# Now we can import config which also fixes the shared-models path
import config  # noqa: E402

from repository.json_repo import JsonUserRepository
from repository.db_repo import DbUserRepository
from service.user_service import UserService
from interface.console.console_ui import main_menu


def _build_repo():
    backend = config.REPO_BACKEND.lower()
    if backend == "json":
        return JsonUserRepository(users_dir=config.USERS_DIR)
    if backend == "db":
        conn_str = os.getenv("PROFILE_DB_URL", "")
        return DbUserRepository(connection_string=conn_str)
    raise ValueError(
        f"Unknown PROFILE_REPO_BACKEND='{backend}'. Valid values: 'json', 'db'."
    )


def build_app():
    """Build and return a FastAPI app with UserService wired up."""
    from interface.api.routes import router, set_service  # noqa: E402
    from fastapi import FastAPI                           # noqa: E402

    repo = _build_repo()
    service = UserService(repo)
    set_service(service)

    app = FastAPI(
        title="User Profile Manager",
        description="CRUD API for user preference profiles",
        version="0.1.0",
    )
    app.include_router(router, prefix="/users")

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "user_profile_manager"}

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="User Profile Manager")
    parser.add_argument("--console", action="store_true", help="Launch interactive console UI")
    parser.add_argument("--port", type=int, default=8004, help="API server port (default: 8004)")
    parser.add_argument("--host", default="127.0.0.1", help="API server host")
    args = parser.parse_args()

    if args.console:
        try:
            repo = _build_repo()
        except ValueError as e:
            print(f"[ERROR] {e}", file=sys.stderr)
            sys.exit(1)
        service = UserService(repo)
        main_menu(service)
    else:
        import uvicorn  # noqa: E402
        app = build_app()
        uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
