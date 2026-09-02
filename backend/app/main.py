from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
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
    feature_flags,
    invoices,
    notifications,
    quotations,
    reconciliation,
    reports,
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


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}
