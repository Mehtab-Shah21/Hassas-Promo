import os
import secrets
import sys
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def is_frozen() -> bool:
    """True when running as a PyInstaller-packaged executable."""
    return bool(getattr(sys, "frozen", False))


def resource_dir() -> Path:
    """Backend root — where read-only bundled resources live (app/templates,
    alembic/, alembic.ini). Inside a PyInstaller bundle this is the
    extracted _MEIPASS temp dir (packaging/pro_invoicing.spec's `datas`
    mirrors this same app/... and alembic/... layout there); in dev it's
    just the backend/ project folder, same as always."""
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent.parent


def _default_data_dir() -> Path:
    """Writable, persistent data (DB, uploads, backups). A packaged Windows
    service shouldn't write next to itself (may be in Program Files, which
    needs elevation, and PyInstaller's --onefile temp dir is ephemeral
    anyway) — ProgramData is the standard writable-by-service location. In
    dev, keep using the existing backend/ project folder so nothing changes
    for local development."""
    if is_frozen():
        base = Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "ProInvoicing"
    else:
        base = Path(__file__).resolve().parent.parent.parent
    base.mkdir(parents=True, exist_ok=True)
    return base


def _default_database_url() -> str:
    db_path = _default_data_dir() / "pro_invoicing.db"
    return f"sqlite:///{db_path.as_posix()}"


def frontend_dist_dir() -> Path:
    """The built frontend (frontend/dist), bundled read-only alongside
    app/templates and alembic/ in a packaged install (see pro_invoicing.spec)
    so one process serves both the API and the UI -- no separate web server
    or Electron/Node runtime needed on the end-user PC. In dev this simply
    doesn't exist (the frontend runs via `npm run dev` on its own port
    instead), so app/main.py only mounts it when the directory is present."""
    return resource_dir() / "frontend_dist"


def _default_upload_dir() -> str:
    upload_path = _default_data_dir() / "uploads"
    upload_path.mkdir(parents=True, exist_ok=True)
    return str(upload_path)


def _default_secret_key() -> str:
    """A real per-install JWT signing secret, generated once and reused.

    The hardcoded fallback this replaced ("dev-secret-key-change-in-
    production") is committed to source control and public in the repo --
    anyone who has ever seen this codebase can read it and forge a valid
    access token for ANY user, including a superadmin, without ever knowing a
    password. Every JWT this app issues (see core/security.create_access_token)
    is only as secret as this key.

    Only used when SECRET_KEY isn't set via environment/`.env` — an explicit
    env var (e.g. the Render web-demo deployment) still wins, same precedence
    pydantic-settings already gives every other field here. For everyone else
    (the offline/LAN install this app ships as), a random 256-bit key is
    generated on first run and persisted next to the database, so it survives
    restarts but is unique per installation -- exactly the same pattern
    _default_database_url()/_default_upload_dir() already use for "just works,
    no manual setup" data storage.
    """
    key_path = _default_data_dir() / "secret.key"
    try:
        existing = key_path.read_text(encoding="utf-8").strip()
        if existing:
            return existing
    except OSError:
        pass
    key = secrets.token_hex(32)
    try:
        key_path.write_text(key, encoding="utf-8")
    except OSError:
        # Can't persist (e.g. read-only filesystem) -- still return a real
        # random key for this run rather than falling back to a known one;
        # every existing login will need to sign in again next restart, which
        # is a far smaller problem than an unauthenticated admin takeover.
        pass
    return key


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PRO Invoicing"
    database_url: str = Field(default_factory=_default_database_url)
    upload_dir: str = Field(default_factory=_default_upload_dir)
    secret_key: str = Field(default_factory=_default_secret_key)
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    auto_lock_minutes: int = 15
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cors_origin_regex: str = r"^http://(localhost|127\.0\.0\.1):\d+$"
    # Admin install binds 0.0.0.0 so LAN employee PCs can reach it; dev
    # defaults to localhost-only. Overridable via env for the packaged service.
    host: str = "127.0.0.1"
    port: int = 8000

    # --- Web-demo deployment only (Render + Vercel) — see DEPLOY.md. Both
    # default to their existing offline/LAN behavior (off / unset) so a
    # normal dev run or packaged install is completely unaffected. ---

    # The deployed frontend's origin (e.g. https://my-app.vercel.app), added
    # to cors_origins alongside the existing localhost dev origins — see
    # main.py. Not needed for local dev or the LAN install (employee PCs
    # never make a cross-origin browser request, they're the same origin
    # via ServerConfigGate's configured server URL, not CORS).
    frontend_origin: str | None = None

    # Render's ephemeral filesystem means a fresh container can start with
    # no database at all — run Alembic to head and the idempotent seed on
    # every boot so the demo always has data. Off by default: a dev running
    # `uvicorn app.main:app` locally, or the packaged .exe (which already
    # runs its own migration/seed step in packaging/run_server.py), doesn't
    # need or want this running on every reload/restart too.
    run_migrations_on_startup: bool = False

    @field_validator("database_url")
    @classmethod
    def _normalize_postgres_scheme(cls, v: str) -> str:
        # Managed Postgres providers (Render included) commonly hand out
        # "postgres://" URLs, a scheme SQLAlchemy 1.4+ rejects outright —
        # it wants "postgresql://". Normalizing here means switching
        # DATABASE_URL from SQLite to Render Postgres is really just an env
        # var change, no code change, exactly as intended.
        if v.startswith("postgres://"):
            return "postgresql://" + v[len("postgres://") :]
        return v


settings = Settings()
