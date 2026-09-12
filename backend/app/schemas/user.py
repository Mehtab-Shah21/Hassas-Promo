from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserCreate(BaseModel):
    username: str
    first_name: str
    last_name: str | None = None
    display_name: str | None = None
    email: EmailStr | None = None
    password: str
    role: UserRole = UserRole.employee
    employee_id: int | None = None
    avatar_color: str | None = None
    phone_code: str | None = None
    phone: str | None = None


class UserUpdate(BaseModel):
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    display_name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: UserRole | None = None
    employee_id: int | None = None
    avatar_color: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str | None
    display_name: str | None
    email: str | None
    role: UserRole
    employee_id: int | None
    avatar_color: str | None
    phone_code: str | None
    phone: str | None
    is_active: bool

    model_config = {"from_attributes": True}
