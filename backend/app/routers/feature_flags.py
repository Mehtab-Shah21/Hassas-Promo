from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id, require_admin
from app.models.feature_flag import FeatureFlag
from app.schemas.feature_flag import FeatureFlagResponse, FeatureFlagUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/feature-flags", tags=["feature-flags"])


@router.get("", response_model=list[FeatureFlagResponse])
def list_flags(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Per-business module flags for the active business, plus any global
    # flags (business_id NULL — currently just "iim", an install-wide
    # toggle rather than a module within a business).
    return (
        db.query(FeatureFlag)
        .filter(or_(FeatureFlag.business_id == business_id, FeatureFlag.business_id.is_(None)))
        .order_by(FeatureFlag.key)
        .all()
    )


@router.patch("/{key}", response_model=FeatureFlagResponse)
def update_flag(
    key: str,
    payload: FeatureFlagUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key, FeatureFlag.business_id == business_id).first()
    if not flag:
        # Falls back to a global flag (e.g. "iim") when nothing is scoped
        # to this specific business.
        flag = db.query(FeatureFlag).filter(FeatureFlag.key == key, FeatureFlag.business_id.is_(None)).first()
    if not flag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature flag not found")
    flag.enabled = payload.enabled
    write_audit_log(
        db, user_id=current_user.id, business_id=flag.business_id, action="update",
        entity_type="feature_flag", entity_id=flag.id,
        description=f"{'Enabled' if flag.enabled else 'Disabled'} feature flag {flag.key}",
    )
    db.commit()
    db.refresh(flag)
    return flag
