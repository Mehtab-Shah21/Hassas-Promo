import enum
from datetime import date, time

from sqlalchemy import Date, Enum, ForeignKey, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    leave = "leave"
    # Came in for part of the day. Costs half a day of pay, like absent costs a
    # whole one (see services/salary_deductions.py); leave and lateness cost nothing.
    half_day = "half_day"


class Attendance(TimestampMixin, Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),)

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # When the person arrived and when they left, as local wall-clock times on
    # `date`. Both optional: a status can be marked with no times, and someone
    # who is still in the office simply has no check_out yet. Only meaningful
    # for a day the person was in (present / half_day; see routers/attendance.py).
    check_in: Mapped[time | None] = mapped_column(Time, nullable=True)
    check_out: Mapped[time | None] = mapped_column(Time, nullable=True)
