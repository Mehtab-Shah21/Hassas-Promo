import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class ExpenseType(str, enum.Enum):
    salary = "salary"
    overhead = "overhead"
    company_expense = "company_expense"


class Expense(TimestampMixin, Base):
    """Scoped per business, same as customers/services. amount is stored
    Numeric(12, 2) — SQLAlchemy hydrates that as Python Decimal (not
    float) as long as application code doesn't cast it away, which is what
    all the new expense math (see services/expenses.py) relies on."""

    __tablename__ = "expenses"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    type: Mapped[ExpenseType] = mapped_column(Enum(ExpenseType), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # Only meaningful (and required by the API, not the DB) for type=salary.
    # base_salary is copied into `amount` once, at creation/selection time —
    # editing amount afterward never writes back to Employee.base_salary.
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    attachment_path: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Set when this row was generated from a fixed monthly cost rather than
    # typed in by hand -- drives the "Recurring" badge in the list and lets
    # generation stay idempotent (one row per definition per month). Editing
    # or attaching a receipt to this row never touches the definition.
    recurring_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_expenses.id"), nullable=True, index=True
    )
    # A generated cost starts as owed, not paid -- that's what makes "this
    # month: X paid, Y still pending" (dashboard, employee salary status)
    # meaningful. A manually recorded one-off defaults to paid, since it is
    # normally entered after the money has already gone out.
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    paid_on: Mapped[date | None] = mapped_column(Date, nullable=True)
