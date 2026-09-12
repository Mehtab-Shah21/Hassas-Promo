import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    employee = "employee"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    # Login identity. Email is kept only as an optional record field — see
    # CLAUDE.md and PROGRESS.md for the switch from email- to
    # username-based login.
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(100))
    display_name: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.employee, nullable=False)
    # Optional link to the shared staff record (Employee) this account
    # represents — an employee may have no login at all, and a login isn't
    # required to have a linked employee (e.g. an admin-only account with
    # no attendance/salary tracking).
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id"), nullable=True, unique=True, index=True
    )
    avatar_color: Mapped[str | None] = mapped_column(String(20))
    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))
    auto_lock_minutes: Mapped[int] = mapped_column(default=15, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
