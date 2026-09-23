from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.expense import ExpenseType

# Bounds mirror app/models/recurring_expense.py's columns. amount has the same
# floor/ceiling reasoning as the one-off expense schema: a fixed cost can
# never be negative, and a finite ceiling keeps a typo from committing the
# business to an absurd monthly figure that then repeats forever.

REPEATABLE_TYPES = (ExpenseType.salary, ExpenseType.overhead)


class RecurringExpenseBase(BaseModel):
    type: ExpenseType
    label: str = Field(max_length=200)
    amount: float = Field(ge=0, le=100_000_000)
    employee_id: int | None = None
    day_of_month: int = Field(default=1, ge=1, le=31)
    # Salaries only: the day of the month the pay goes out (when admins are
    # alerted to confirm any absence deduction). None = the last day of the month.
    pay_day: int | None = Field(default=None, ge=1, le=31)
    # Real calendar dates (any day), not whole months: a start on the 15th is
    # charged for the 15th to month-end in its first month, prorated by that
    # month's actual length. end_date is inclusive; None runs indefinitely.
    start_date: date
    end_date: date | None = None

    @model_validator(mode="after")
    def _check_shape(self):
        if self.type not in REPEATABLE_TYPES:
            raise ValueError("Only salaries and overheads repeat monthly; a company expense is recorded as a one-off")
        if self.type == ExpenseType.salary and self.employee_id is None:
            raise ValueError("A recurring salary must be linked to an employee")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("The end date can't be before the start date")
        return self


class RecurringExpenseCreate(RecurringExpenseBase):
    pass


class RecurringExpenseUpdate(BaseModel):
    # type is deliberately absent: a salary can't become an overhead, since
    # the already-generated history would no longer match the definition.
    label: str | None = Field(default=None, max_length=200)
    amount: float | None = Field(default=None, ge=0, le=100_000_000)
    employee_id: int | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    pay_day: int | None = Field(default=None, ge=1, le=31)
    end_date: date | None = None
    is_active: bool | None = None


class RecurringExpenseResponse(BaseModel):
    id: int
    business_id: int
    type: ExpenseType
    label: str
    amount: float
    employee_id: int | None
    employee_name: str | None = None
    day_of_month: int
    pay_day: int | None = None
    start_date: date
    end_date: date | None
    is_active: bool
    created_by: int
    # How many months have actually been generated from this so far -- shown
    # in the list so it's obvious the thing is running.
    generated_count: int = 0

    model_config = {"from_attributes": True}


class FixedCostSummary(BaseModel):
    """The dashboard card: what we're committed to monthly, and where this
    month stands against it."""

    monthly_commitment: float
    active_count: int
    generated_total: float
    paid: float
    pending: float
    entry_count: int
