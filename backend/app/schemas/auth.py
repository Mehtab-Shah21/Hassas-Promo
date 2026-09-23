from pydantic import BaseModel, Field

from app.models.user import UserRole

# Every string field below caps input length before it ever reaches the DB —
# SQLite's VARCHAR(n) declared on the model is NOT enforced by SQLite itself
# (it has no real length limit), so without a matching cap here a client could
# submit an arbitrarily large "username" or "pin" and have it stored/hashed
# as-is. Lengths mirror the corresponding model column (see app/models/user.py)
# or, for password/pin, a generous practical bound.
#
# Note on password length: passlib's bcrypt scheme only uses the first 72
# BYTES of a password — anything beyond that is silently ignored by the
# algorithm itself, not by this validation. Capping at 128 characters here
# prevents someone from submitting a multi-kilobyte string that costs CPU to
# hash for no security benefit; it does not change bcrypt's own 72-byte
# behavior, which would require re-hashing every existing account to alter.


class LoginRequest(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=128)


class PinLoginRequest(BaseModel):
    username: str = Field(max_length=50)
    pin: str = Field(max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUser(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str | None
    display_name: str | None
    email: str | None
    role: UserRole
    employee_id: int | None
    business_id: int | None
    avatar_color: str | None
    auto_lock_minutes: int
    is_system_owner: bool

    model_config = {"from_attributes": True}


class SetPinRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class SetAutoLockRequest(BaseModel):
    auto_lock_minutes: int = Field(ge=1, le=120)


# --- Superadmin self-recovery ------------------------------------------------
# A manager or employee who forgets their password asks a superadmin. A
# superadmin has nobody above them, so they get a recovery code instead:
# generated once, shown once, stored only as a hash.


class RecoveryCodeResponse(BaseModel):
    recovery_code: str


class RecoveryStatusResponse(BaseModel):
    has_recovery_code: bool


class RecoverAccountRequest(BaseModel):
    # Deliberately no username field: the point is that this still works for
    # someone who has forgotten their username as well as their password --
    # the code identifies the account, and the response tells them which
    # username it belongs to.
    recovery_code: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class RecoverAccountResponse(BaseModel):
    username: str
    message: str
