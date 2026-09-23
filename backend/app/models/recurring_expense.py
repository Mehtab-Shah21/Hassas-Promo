from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.expense import ExpenseType
from app.models.mixins import TimestampMixin


class RecurringExpense(TimestampMixin, Base):
    """A fixed monthly cost defined once -- a salary or an overhead -- that
    the system turns into a real Expense row every month on its own.

    Why definitions and generated rows are separate tables: the definition is
    what the business *commits* to paying monthly; each generated Expense is
    what actually happened in one specific month. Keeping them apart is what
    makes every requirement work without special cases:

    - Editing `amount` here only affects months generated from now on, so last
      month's records stay exactly as they were paid.
    - Setting `is_active` False stops future months while every past entry
      survives untouched.
    - A one-off adjustment (a higher utility bill, a bonus, attaching a
      payslip) is just a normal edit of that month's Expense row -- it never
      has to touch this definition.

    Generation is idempotent and catches up: see services/recurring_expenses.py.
    """

    __tablename__ = "recurring_expenses"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    # Only salary and overhead repeat; company_expense stays one-off/manual.
    type: Mapped[ExpenseType] = mapped_column(Enum(ExpenseType), nullable=False)
    # What shows in the list and on each generated expense ("Rent", "Shop
    # electricity"). For a salary this defaults to the employee's name.
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    # Required for type=salary, unused otherwise.
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    # Which day each generated expense is dated, clamped to the length of the
    # month and to the period actually covered that month. New definitions use
    # 1, i.e. "dated the first day covered" (the 1st, or the start date in a
    # partial first month); older ones keep the payment day they were given.
    day_of_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # The real first day the cost applies -- any day, not just the 1st. A start
    # on the 15th means the first month is charged for the 15th through the end
    # of that month only, prorated by the calendar (see
    # services/recurring_expenses.covered_period / prorated_amount).
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    # The real last day the cost applies (inclusive), or NULL to run
    # indefinitely, rolling into each new year with no gap. An end on the 20th
    # means that final month is charged for the 1st through the 20th only.
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Salaries only: the day of the month the pay goes out, which is when
    # admins are alerted to confirm any absence deduction. NULL = the last day
    # of the month (whatever length that month is). Days past a short month's
    # end clamp to it, so a "31st" pay day lands on the 30th / 28th.
    pay_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
