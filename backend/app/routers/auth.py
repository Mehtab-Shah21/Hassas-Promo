import secrets

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
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUser,
    LoginRequest,
    PinLoginRequest,
    RecoverAccountRequest,
    RecoverAccountResponse,
    RecoveryCodeResponse,
    RecoveryStatusResponse,
    SetAutoLockRequest,
    SetPinRequest,
    TokenResponse,
)
from app.services.audit import write_audit_log
from app.services.rate_limit import record_failure, record_success, seconds_until_unlocked

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    locked_for = seconds_until_unlocked(payload.username)
    if locked_for:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {locked_for // 60 + 1} minute(s).",
        )
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        record_failure(payload.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    record_success(payload.username)
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
    # Shares one lockout with password login, keyed by username -- a PIN is
    # only 4-6 digits (at most a million combinations), so it needs the same
    # throttle at least as much as the password path.
    locked_for = seconds_until_unlocked(payload.username)
    if locked_for:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {locked_for // 60 + 1} minute(s).",
        )
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not user.pin_hash or not verify_pin(payload.pin, user.pin_hash):
        record_failure(payload.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")
    record_success(payload.username)
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
    # Employees can't set their own password; a superadmin (or their company
    # admin) resets it for them from the Users page instead.
    if current_user.role == UserRole.employee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employees can't change their own password. Ask a superadmin to reset it.",
        )
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    write_audit_log(
        db, user_id=current_user.id, business_id=current_user.business_id, action="update",
        entity_type="user", entity_id=current_user.id,
        description=f"{current_user.username} changed their own password",
    )
    db.commit()
    return {"ok": True}


# --- Superadmin self-recovery ------------------------------------------------
# Everyone else who forgets a password has someone above them who can reset it
# (an employee asks a manager's superadmin; a superadmin resets admins). The
# superadmin themselves has nobody -- without this, a forgotten superadmin
# password means nobody can ever administer the install again. The recovery
# code is the answer: generated by the superadmin while they still have
# access, shown once, kept only as a hash, and usable from the login screen to
# recover BOTH the username and the password.

RECOVERY_RATE_LIMIT_KEY = "__recovery__"


@router.get("/recovery-code", response_model=RecoveryStatusResponse)
def recovery_code_status(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only a superadmin has a recovery code"
        )
    return RecoveryStatusResponse(has_recovery_code=bool(current_user.recovery_code_hash))


@router.post("/recovery-code", response_model=RecoveryCodeResponse)
def generate_recovery_code(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Issue a fresh recovery code for this superadmin, replacing any previous
    one. Returned in the clear exactly once -- it is stored hashed, so if it's
    lost the only option is to generate another while still signed in."""
    if current_user.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only a superadmin can generate a recovery code"
        )

    # 4 groups of 5 from an unambiguous alphabet (no O/0, I/1) -- it gets
    # written on paper or into a safe, so it has to survive handwriting.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "-".join("".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(4))
    current_user.recovery_code_hash = hash_password(raw)
    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="update",
        entity_type="user", entity_id=current_user.id,
        description=f"{current_user.username} generated a new account recovery code",
        source_ip=get_client_ip(request),
    )
    db.commit()
    return RecoveryCodeResponse(recovery_code=raw)


@router.post("/recover", response_model=RecoverAccountResponse)
def recover_account(payload: RecoverAccountRequest, request: Request, db: Session = Depends(get_db)):
    """Unauthenticated: set a new password using a recovery code, and be told
    which username it belongs to (for the case where that was forgotten too).

    Throttled on a single shared key rather than per-username, because the
    caller doesn't supply a username -- without that, this endpoint would be
    an unlimited oracle for guessing codes.
    """
    locked_for = seconds_until_unlocked(RECOVERY_RATE_LIMIT_KEY)
    if locked_for:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed recovery attempts. Try again in {locked_for // 60 + 1} minute(s).",
        )

    candidates = (
        db.query(User)
        .filter(User.role == UserRole.superadmin, User.recovery_code_hash.isnot(None), User.is_active.is_(True))
        .all()
    )
    submitted = payload.recovery_code.strip().upper()
    matched = next((u for u in candidates if verify_password(submitted, u.recovery_code_hash or "")), None)
    if matched is None:
        record_failure(RECOVERY_RATE_LIMIT_KEY)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That recovery code isn't valid")

    record_success(RECOVERY_RATE_LIMIT_KEY)
    matched.password_hash = hash_password(payload.new_password)
    # One code, one use: spend it, so a copy left lying around can't be
    # reused later. They generate a new one after signing back in.
    matched.recovery_code_hash = None
    write_audit_log(
        db, user_id=matched.id, business_id=None, action="update",
        entity_type="user", entity_id=matched.id,
        description=f"Password for {matched.username} was reset using the account recovery code",
        source_ip=get_client_ip(request),
    )
    db.commit()
    return RecoverAccountResponse(
        username=matched.username,
        message="Password reset. Sign in with your new password, then generate a fresh recovery code.",
    )


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
