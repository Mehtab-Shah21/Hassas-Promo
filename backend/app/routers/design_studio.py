import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.models.business import Business
from app.services.pdf import (
    DEFAULT_TEMPLATE_CONFIG,
    DEFAULT_THERMAL_CONFIG,
    DOC_KINDS,
    render_sample_html,
    render_thermal_sample_html,
)

router = APIRouter(prefix="/api/design-studio", tags=["design-studio"])


def _validate_doc_kind(doc_type: str) -> str:
    if doc_type not in DOC_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"doc_type must be one of {DOC_KINDS}")
    return doc_type


@router.get("/defaults")
def get_defaults(
    doc_type: str = Query(default="invoice"),
    current_user=Depends(require_admin),
):
    _validate_doc_kind(doc_type)
    return DEFAULT_TEMPLATE_CONFIG


@router.get("/preview", response_class=HTMLResponse)
def preview(
    request: Request,
    doc_type: str = Query(default="invoice"),
    config: str | None = Query(default=None, description="URL-encoded JSON config override for an unsaved draft"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    _validate_doc_kind(doc_type)
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    override = None
    if config:
        try:
            override = json.loads(config)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid config JSON") from exc
    return HTMLResponse(
        render_sample_html(business, doc_kind=doc_type, config_override=override, base_url=str(request.base_url))
    )


@router.get("/thermal-defaults")
def get_thermal_defaults(current_user=Depends(require_admin)):
    return DEFAULT_THERMAL_CONFIG


@router.get("/thermal-preview", response_class=HTMLResponse)
def thermal_preview(
    request: Request,
    config: str | None = Query(default=None, description="URL-encoded JSON config override for an unsaved draft"),
    width: int | None = Query(default=None, description="Override the business's stored paper width: 58 or 80"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    override = None
    if config:
        try:
            override = json.loads(config)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid config JSON") from exc
    return HTMLResponse(
        render_thermal_sample_html(
            business, config_override=override, width_override=width, base_url=str(request.base_url)
        )
    )
