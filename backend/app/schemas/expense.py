import datetime
from decimal import Decimal

from pydantic import BaseModel, model_validator

from app.models.expense import ExpenseType

# NOTE: fields are named `date` but referenced via `datetime.date` (not a
# bare `from datetime import date`) — `date: date | None = None` binds the
# class attribute `date = None` *before* evaluating the `date | None`
# annotation, so the annotation itself ends up as `None | None` and raises
# TypeError at class-definition time. Qualifying as `datetime.date` sidesteps
# it since the name being looked up (`datetime`) is never shadowed.


class ExpenseCreate(BaseModel):
    type: ExpenseType
    amount: Decimal
    description: str | None = None
    date: datetime.date
    employee_id: int | None = None

    @model_validator(mode="after")
    def _salary_requires_employee(self) -> "ExpenseCreate":
        if self.type == ExpenseType.salary and self.employee_id is None:
            raise ValueError("A salary expense must be linked to an employee")
        return self


class ExpenseUpdate(BaseModel):
    type: ExpenseType | None = None
    amount: Decimal | None = None
    description: str | None = None
    date: datetime.date | None = None
    employee_id: int | None = None


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
