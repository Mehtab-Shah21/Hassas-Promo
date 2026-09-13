import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user, require_admin
from app.models.business import Business
from app.models.user import UserRole
from app.schemas.business import BusinessResponse, BusinessUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/businesses", tags=["businesses"])

UPLOAD_DIR = Path(settings.upload_dir)
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}
MAX_LOGO_BYTES = 3 * 1024 * 1024


def _assert_in_scope(current_user, business_id: int) -> None:
    """A non-superadmin may only ever see/touch their OWN company here —
    otherwise this list/get endpoint would hand a company admin the other
    company's name, branding, bank details, etc. by ID. 404 (not 403) so
    they can't distinguish "doesn't exist" from "exists, not yours"."""
    if current_user.role != UserRole.superadmin and current_user.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")


@router.get("", response_model=list[BusinessResponse])
def list_businesses(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    q = db.query(Business).filter(Business.is_active.is_(True))
    if current_user.role != UserRole.superadmin:
        q = q.filter(Business.id == current_user.business_id)
    return q.order_by(Business.id).all()


@router.get("/{business_id}", response_model=BusinessResponse)
def get_business(business_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _assert_in_scope(current_user, business_id)
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return business


@router.patch("/{business_id}", response_model=BusinessResponse)
def update_business(
    business_id: int,
    payload: BusinessUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    _assert_in_scope(current_user, business_id)
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="business", entity_id=business.id, description=f"Updated {business.name} settings",
    )
    db.commit()
    db.refresh(business)
    return business


@router.post("/{business_id}/logo", response_model=BusinessResponse)
def upload_logo(
    business_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    _assert_in_scope(current_user, business_id)
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
    contents = file.file.read(MAX_LOGO_BYTES + 1)
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo must be under 3MB")

    ext = Path(file.filename or "").suffix or ".png"
    filename = f"business-{business_id}-{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(contents)

    business.logo_path = f"/uploads/{filename}"
    db.commit()
    db.refresh(business)
    return business
