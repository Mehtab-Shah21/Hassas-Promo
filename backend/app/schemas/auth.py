from pydantic import BaseModel

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class PinLoginRequest(BaseModel):
    username: str
    pin: str


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

    model_config = {"from_attributes": True}


class SetPinRequest(BaseModel):
    pin: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SetAutoLockRequest(BaseModel):
    auto_lock_minutes: int
