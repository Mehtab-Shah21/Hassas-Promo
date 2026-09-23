import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class DeductionDecision(str, enum.Enum):
    confirmed = "confirmed"
    waived = "waived"


class SalaryDeduction(TimestampMixin, Base):
    """An admin's decision on one salary payment's absence deduction.

    There is deliberately NO row until someone decides. Until then the figure
    is computed live from attendance (services/salary_deductions.py), so
    correcting a wrongly marked day just changes the estimate. Confirming
    freezes what was worked out at that moment -- days, daily rate and amount
    -- so the salary that was paid can always be explained afterwards, even if
    attendance is edited later.

    One row per salary Expense (unique). "Reopen" deletes the row and puts the
    money back; the audit log keeps the history of who decided what.
    """

    __tablename__ = "salary_deductions"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id"), nullable=False, unique=True)
    decision: Mapped[DeductionDecision] = mapped_column(Enum(DeductionDecision), nullable=False)
    # The stretch of the calendar the salary covers, and what attendance said
    # about it when the decision was made.
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    absent_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    half_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # absent x 1 + half day x 0.5
    deduction_days: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    # salary for the covered period / days in it -- monthly pay / that month's real length.
    daily_rate: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    gross_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    # What was actually taken off the salary: the computed figure when
    # confirmed, 0 when waived.
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    decided_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
