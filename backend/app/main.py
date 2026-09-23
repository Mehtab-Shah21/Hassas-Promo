from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import frontend_dist_dir, settings
from app.middleware.body_size_limit import BodySizeLimitMiddleware
from app.routers import (
    attendance,
    audit_log,
    auth,
    backup,
    businesses,
    coupons,
    customers,
    dashboard,
    design_studio,
    employees,
    expenses,
    feature_flags,
    invoices,
    notifications,
    quotations,
    reconciliation,
    recurring_expenses,
    reports,
    salary_deductions,
    services,
    users,
)

app = FastAPI(title=settings.app_name)

UPLOAD_DIR = Path(settings.upload_dir)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# frontend_origin (Render/Vercel web demo only, see DEPLOY.md) is added
# alongside the existing localhost dev origins rather than replacing them,
# so this same backend still works for local frontend dev either way.
_cors_origins = list(settings.cors_origins)
if settings.frontend_origin:
    _cors_origins.append(settings.frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Rejects an oversized request before it's read into memory at all -- added
# after add_middleware(CORS) so it runs FIRST (Starlette applies middleware
# in reverse of registration order), otherwise a giant body would still get
# buffered by CORS's own pass-through before this ever saw it.
app.add_middleware(BodySizeLimitMiddleware)

app.include_router(auth.router)
app.include_router(businesses.router)
app.include_router(users.router)
app.include_router(feature_flags.router)
app.include_router(customers.router)
app.include_router(services.router)
app.include_router(coupons.router)
app.include_router(invoices.router)
app.include_router(quotations.router)
app.include_router(reconciliation.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(reports.router)
app.include_router(audit_log.router)
app.include_router(design_studio.router)
app.include_router(expenses.router)
app.include_router(recurring_expenses.router)
app.include_router(salary_deductions.router)
app.include_router(backup.router)


@app.on_event("startup")
def _run_migrations_and_seed_for_web_demo() -> None:
    """Off by default (see Settings.run_migrations_on_startup) — only runs
    for the Render web-demo deployment, which sets RUN_MIGRATIONS_ON_STARTUP=
    true precisely because its filesystem is ephemeral: a redeploy or
    restart can start from an empty database, and this guarantees the demo
    always has Main/IIM + an admin login without anyone doing it by hand.
    Mirrors packaging/run_server.py's migration+seed step for the offline
    installer — both call the same idempotent app.seed.seed()."""
    if not settings.run_migrations_on_startup:
        return

    from alembic import command
    from alembic.config import Config

    from app.core.config import resource_dir
    from app.seed import seed

    alembic_cfg = Config()
    alembic_cfg.set_main_option("script_location", str(resource_dir() / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(alembic_cfg, "head")
    seed()


@app.on_event("startup")
def _start_automatic_backups() -> None:
    """Background backup scheduler (SQLite installs only). It checks shortly
    after startup and then periodically, so a PC that was switched off when a
    backup was due catches up soon after the app next starts. See
    services/backup.py."""
    from app.services.backup import start_auto_backup_scheduler

    start_auto_backup_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# Serves the built frontend (frontend/dist, bundled into the packaged
# install as frontend_dist/ -- see config.frontend_dist_dir and
# packaging/pro_invoicing.spec). Registered LAST so it never shadows an
# /api/... or /uploads/... route above; in dev the directory doesn't exist
# (the frontend runs separately via `npm run dev`), so this is a no-op then.
_FRONTEND_DIR = frontend_dist_dir()
if _FRONTEND_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIR / "assets")), name="frontend-assets")

    # Tells the frontend (see api/client.ts's RUNTIME_URL) that this page is
    # already being served by its own backend, so it should call the same
    # origin it was loaded from -- whatever host/port that turns out to be --
    # instead of needing a specific URL baked in at build time. Computed once
    # at startup, not per-request, since index.html never changes at runtime.
    from fastapi.responses import HTMLResponse

    _INDEX_HTML = (_FRONTEND_DIR / "index.html").read_text(encoding="utf-8").replace(
        "<head>", '<head><script>window.__PRO_INVOICING_SERVER_URL__ = "";</script>', 1
    )

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # A real static file (favicon, manifest, etc.) at the requested path
        # wins; everything else is a client-side route, so hand back
        # index.html and let the React router take it from there.
        candidate = _FRONTEND_DIR / full_path
        if full_path and candidate.is_file() and candidate.resolve().parent.is_relative_to(_FRONTEND_DIR.resolve()):
            return FileResponse(candidate)
        return HTMLResponse(_INDEX_HTML)
