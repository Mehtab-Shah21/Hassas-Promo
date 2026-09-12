from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_client_ip, get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    hash_pin,
    verify_password,
    verify_pin,
)
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUser,
    LoginRequest,
    PinLoginRequest,
    SetAutoLockRequest,
    SetPinRequest,
    TokenResponse,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token({"sub": str(user.id)})
    write_audit_log(
        db,
        user_id=user.id,
        business_id=None,
        action="login",
        entity_type="user",
        entity_id=user.id,
        description=f"{user.username} signed in (password)",
        source_ip=get_client_ip(request),
    )
    db.commit()
    return TokenResponse(access_token=token)


@router.post("/login-pin", response_model=TokenResponse)
def login_pin(payload: PinLoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not user.pin_hash or not verify_pin(payload.pin, user.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")
    token = create_access_token({"sub": str(user.id)})
    write_audit_log(
        db,
        user_id=user.id,
        business_id=None,
        action="login",
        entity_type="user",
        entity_id=user.id,
        description=f"{user.username} signed in (PIN)",
        source_ip=get_client_ip(request),
    )
    db.commit()
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUser)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/set-pin")
def set_pin(
    payload: SetPinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (4 <= len(payload.pin) <= 6) or not payload.pin.isdigit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN must be 4-6 digits")
    current_user.pin_hash = hash_pin(payload.pin)
    db.commit()
    return {"ok": True}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.post("/set-auto-lock")
def set_auto_lock(
    payload: SetAutoLockRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (1 <= payload.auto_lock_minutes <= 120):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Auto-lock must be between 1 and 120 minutes"
        )
    current_user.auto_lock_minutes = payload.auto_lock_minutes
    db.commit()
    return {"ok": True}
