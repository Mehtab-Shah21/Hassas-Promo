import io
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id, require_manager, require_module_enabled
from app.models.coupon import Coupon, CouponKind, DiscountType
from app.schemas.coupon import CouponCreate, CouponResponse, CouponUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/coupons", tags=["coupons"], dependencies=[Depends(require_module_enabled("coupons"))])

UPLOAD_DIR = Path(settings.upload_dir)
ALLOWED_BANNER_TYPES = {"image/png": ".png", "image/jpeg": ".jpg"}
MAX_BANNER_BYTES = 5 * 1024 * 1024


def _neutralise_banner(coupon: Coupon) -> None:
    """A banner coupon is artwork, not a discount — keep its money fields inert
    so it can never take anything off an invoice, whatever a client sends."""
    if coupon.kind == CouponKind.banner:
        coupon.discount_type = DiscountType.fixed
        coupon.value = 0


@router.get("", response_model=list[CouponResponse])
def list_coupons(
    active_only: bool = False,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Coupon).filter(Coupon.business_id == business_id)
    if active_only:
        today = date.today()
        q = q.filter(Coupon.is_active.is_(True))
        q = q.filter((Coupon.valid_from.is_(None)) | (Coupon.valid_from <= today))
        q = q.filter((Coupon.valid_to.is_(None)) | (Coupon.valid_to >= today))
    return q.order_by(Coupon.code).all()


@router.post("", response_model=CouponResponse, status_code=status.HTTP_201_CREATED)
def create_coupon(
    payload: CouponCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    coupon = Coupon(business_id=business_id, **payload.model_dump())
    _neutralise_banner(coupon)
    db.add(coupon)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="coupon", entity_id=coupon.id, description=f"Created coupon {coupon.code}",
    )
    db.commit()
    db.refresh(coupon)
    return coupon


@router.patch("/{coupon_id}", response_model=CouponResponse)
def update_coupon(
    coupon_id: int,
    payload: CouponUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    coupon = db.get(Coupon, coupon_id)
    if not coupon or coupon.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, field, value)
    _neutralise_banner(coupon)
    # CouponUpdate's own >100% check only sees the fields THIS request sent —
    # a value-only PATCH against an already-percent coupon would slip past it.
    # Check the coupon's actual resulting state instead.
    if coupon.kind == CouponKind.discount and coupon.discount_type == DiscountType.percent and float(coupon.value) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A percentage discount can't exceed 100%")
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="coupon", entity_id=coupon.id, description=f"Updated coupon {coupon.code}",
    )
    db.commit()
    db.refresh(coupon)
    return coupon


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_coupon(
    coupon_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    coupon = db.get(Coupon, coupon_id)
    if not coupon or coupon.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    coupon.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="coupon", entity_id=coupon.id, description=f"Deactivated coupon {coupon.code}",
    )
    db.commit()


@router.post("/{coupon_id}/banner", response_model=CouponResponse)
def upload_banner(
    coupon_id: int,
    file: UploadFile,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    coupon = db.get(Coupon, coupon_id)
    if not coupon or coupon.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    if coupon.kind != CouponKind.banner:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only a printed-banner coupon has an image")
    ext = ALLOWED_BANNER_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The banner must be a PNG or JPG image")
    contents = file.file.read(MAX_BANNER_BYTES + 1)
    if len(contents) > MAX_BANNER_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The banner image must be under 5MB")
    try:
        # The content type is client-supplied; make sure it really is an image
        # before it's stored and later drawn into invoice PDFs.
        Image.open(io.BytesIO(contents)).verify()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file isn't a valid image")

    filename = f"coupon-banner-{coupon_id}-{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(contents)
    # The previous image is intentionally kept on disk: invoices that already
    # printed it reference that file for reprints (invoices.banner_path).
    coupon.banner_path = f"/uploads/{filename}"
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="coupon", entity_id=coupon.id, description=f"Uploaded banner image for coupon {coupon.code}",
    )
    db.commit()
    db.refresh(coupon)
    return coupon
