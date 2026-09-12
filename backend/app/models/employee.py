from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class Employee(TimestampMixin, Base):
    """The single staff record shared across modules — Attendance tracks
    against it, a User account may optionally link to one (see
    User.employee_id), and the future Expense module will read
    base_salary from it. Not a login account itself: staff without a
    login still get an Employee row so their attendance/salary can be
    tracked. Scoped per business, same as customers/services, so Main and
    IIM keep separate rosters."""

    __tablename__ = "employees"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str | None] = mapped_column(String(100))
    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))
    base_salary: Mapped[float | None] = mapped_column(Numeric(12, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
