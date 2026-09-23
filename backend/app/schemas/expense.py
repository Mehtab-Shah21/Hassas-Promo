import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.expense import ExpenseType

# NOTE: fields are named `date` but referenced via `datetime.date` (not a
# bare `from datetime import date`) — `date: date | None = None` binds the
# class attribute `date = None` *before* evaluating the `date | None`
# annotation, so the annotation itself ends up as `None | None` and raises
# TypeError at class-definition time. Qualifying as `datetime.date` sidesteps
# it since the name being looked up (`datetime`) is never shadowed.
#
# amount must be positive: a zero/negative expense has no legitimate meaning
# and — since Expense feeds the Dashboard's net-revenue figure (total sales
# minus expenses) — a negative one would silently inflate reported profit,
# exactly the kind of entry a dishonest employee would want to slip in.


class ExpenseCreate(BaseModel):
    type: ExpenseType
    amount: Decimal = Field(gt=0, le=Decimal("100000000"))
    description: str | None = Field(default=None, max_length=1000)
    date: datetime.date
    employee_id: int | None = None
    # A hand-entered expense is normally recorded after the money has gone
    # out, so it defaults to paid; a generated fixed cost starts unpaid (see
    # services/recurring_expenses.py).
    is_paid: bool = True

    @model_validator(mode="after")
    def _salary_requires_employee(self) -> "ExpenseCreate":
        if self.type == ExpenseType.salary and self.employee_id is None:
            raise ValueError("A salary expense must be linked to an employee")
        return self


class ExpenseUpdate(BaseModel):
    type: ExpenseType | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=Decimal("100000000"))
    description: str | None = Field(default=None, max_length=1000)
    date: datetime.date | None = None
    employee_id: int | None = None
    # Adjusting one generated month (a higher bill, a bonus, marking a salary
    # as settled) is just editing that month's row -- it never touches the
    # recurring definition it came from.
    is_paid: bool | None = None
    paid_on: datetime.date | None = None


class ExpenseResponse(BaseModel):
    id: int
    business_id: int
    type: ExpenseType
    amount: Decimal
    description: str | None
    date: datetime.date
    employee_id: int | None
    employee_name: str | None = None
    attachment_path: str | None
    created_by: int
    # Set when the system generated this row from a fixed monthly cost --
    # drives the "Recurring" badge in the list.
    recurring_expense_id: int | None = None
    is_paid: bool = True
    paid_on: datetime.date | None = None

    model_config = {"from_attributes": True}


class PaginatedExpenses(BaseModel):
    items: list[ExpenseResponse]
    total: int
    page: int
    page_size: int
    total_amount: Decimal


class ExpenseSummary(BaseModel):
    total: Decimal
    by_type: dict[str, Decimal]
