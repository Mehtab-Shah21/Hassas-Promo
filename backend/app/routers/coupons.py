from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id, require_admin, require_module_enabled
from app.models.coupon import Coupon
from app.schemas.coupon import CouponCreate, CouponResponse, CouponUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/coupons", tags=["coupons"], dependencies=[Depends(require_module_enabled("coupons"))])


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
    current_user=Depends(require_admin),
):
    coupon = Coupon(business_id=business_id, **payload.model_dump())
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
    current_user=Depends(require_admin),
):
    coupon = db.get(Coupon, coupon_id)
    if not coupon or coupon.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, field, value)
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
    current_user=Depends(require_admin),
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
