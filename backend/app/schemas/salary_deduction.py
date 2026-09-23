import datetime

from pydantic import BaseModel, Field

# Standalone response models (never inheriting constrained input schemas), and
# `datetime.date` rather than a bare `date` import -- fields named `date`
# would shadow it (same trap as schemas/expense.py).


class DeductionSummary(BaseModel):
    """One salary payment's absence deduction, with the working shown."""

    # none | pending | confirmed | waived -- see services/salary_deductions.summarize
    status: str
    period_start: datetime.date
    period_end: datetime.date
    # Days the salary covers; the daily rate is gross / covered_days.
    covered_days: int
    absent_days: int
    half_days: int
    # absent x 1 + half day x 0.5
    deduction_days: float
    daily_rate: float
    # The salary before the deduction
    gross_amount: float
    # What comes off (0 unless confirmed / pending estimate)
    amount: float
    # What is payable: the salary as it stands now, less a pending estimate
    net_amount: float
    pay_date: datetime.date
    # True when an admin can confirm/waive it right now
    can_decide: bool
    decided_at: datetime.datetime | None = None
    decided_by_name: str | None = None


class SalaryAlert(BaseModel):
    """A salary that has reached its pay date and is still unpaid -- one line
    in the admin's notification bell."""

    expense_id: int
    employee_id: int
    employee_name: str
    description: str | None
    pay_date: datetime.date
    days_since_pay_date: int
    deduction: DeductionSummary


class DecisionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)
