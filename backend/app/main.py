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
    feature_flags,
    invoices,
    notifications,
    quotations,
    reports,
    services,
    users,
)

app = FastAPI(title=settings.app_name)

UPLOAD_DIR = Path(settings.upload_dir)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(attendance.router)
app.include_router(reports.router)
app.include_router(audit_log.router)
app.include_router(design_studio.router)
app.include_router(backup.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}
