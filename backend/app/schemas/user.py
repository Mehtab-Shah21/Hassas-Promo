from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole
from app.schemas.employee import EmployeeCreate

# String length caps mirror app/models/user.py's column lengths exactly (see
# the note in schemas/auth.py for why this matters even though the DB is
# SQLite). email uses Pydantic's EmailStr, which already rejects garbage and
# is naturally bounded by RFC-length addresses, but still gets an explicit
# ceiling matching the column.


class UserCreate(BaseModel):
    username: str = Field(max_length=50)
    first_name: str = Field(max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    display_name: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: UserRole = UserRole.employee
    # Link this account to an already-existing, not-yet-linked Employee row.
    # Mutually exclusive with new_employee — see routers/users.py.
    employee_id: int | None = None
    # Create the Employee row and this account together, in one request —
    # the "add a person + optionally give them a login" flow from the Users
    # page. Mutually exclusive with employee_id.
    new_employee: EmployeeCreate | None = None
    # Which company this account belongs to is deliberately NOT a field
    # here: routers/users.py's create_user always resolves it from the
    # caller's active business (X-Business-Id header / current_user.
    # business_id), never from client input — each company adds its own
    # users under its own active-business context, there is no
    # cross-company "assign to company X" picker.
    avatar_color: str | None = Field(default=None, max_length=20)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, max_length=50)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    display_name: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: UserRole | None = None
    employee_id: int | None = None
    # No business_id field — see UserCreate. A superadmin demoted into
    # admin/employee is assigned whichever company is currently active
    # (routers/users.py), not a value picked from this payload.
    avatar_color: str | None = Field(default=None, max_length=20)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
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
    business_id: int | None
    avatar_color: str | None
    phone_code: str | None
    phone: str | None
    is_active: bool
    is_system_owner: bool

    model_config = {"from_attributes": True}


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)
