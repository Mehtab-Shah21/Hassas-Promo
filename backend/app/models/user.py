import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.mixins import TimestampMixin


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    # Runs day-to-day operations (customers, services, coupons, invoicing,
    # expenses, attendance, reconciliation, reports) without the account- and
    # system-configuration powers reserved for admin -- see core/deps.py's
    # MANAGER_ROLES / require_manager and the per-router comments that use it.
    # Rank: employee < manager < admin < superadmin.
    manager = "manager"
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
    # Company assignment for strict per-company isolation. NULL only for
    # superadmin, who spans every company; every admin/employee account
    # MUST have exactly one (enforced in schemas/routers, not a DB
    # constraint — see core/deps.py's require_active_business_id, the
    # single central place a non-superadmin's business_id is resolved and
    # enforced for every business-scoped request).
    business_id: Mapped[int | None] = mapped_column(
        ForeignKey("businesses.id"), nullable=True, index=True
    )
    # Read-only convenience so the Users list can show WHO a login belongs to
    # (the staff record's name) instead of an opaque id. Joined eagerly since
    # every list of users wants it.
    employee = relationship("Employee", foreign_keys=[employee_id], lazy="joined", viewonly=True)
    avatar_color: Mapped[str | None] = mapped_column(String(20))
    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))
    auto_lock_minutes: Mapped[int] = mapped_column(default=15, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # The software vendor's account, one tier above the client's superadmins:
    # the only account that can create or reset a superadmin, and invisible to
    # everyone else. Still role=superadmin, so the rest of the app treats it as
    # one. See routers/users.py for the permission matrix.
    is_system_owner: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Self-service recovery for a superadmin, who has nobody above them to
    # reset their password (an admin/manager/employee just asks a superadmin).
    # Hashed like a password, never stored or recoverable in plain text: the
    # code is shown exactly once, when generated, and the holder of it can
    # look their username back up and set a new password from the login
    # screen. See routers/auth.py's recovery endpoints.
    recovery_code_hash: Mapped[str | None] = mapped_column(String(255))

    @property
    def employee_name(self) -> str | None:
        return self.employee.name if self.employee is not None else None
