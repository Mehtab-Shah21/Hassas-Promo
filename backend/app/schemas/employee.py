import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.salary_deduction import DeductionSummary

# Lengths mirror app/models/employee.py's column lengths.


class EmployeeCreate(BaseModel):
    name: str = Field(max_length=150)
    role: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=255)
    base_salary: float | None = Field(default=None, ge=0)
    emirates_id: str | None = Field(default=None, max_length=50)
    passport_no: str | None = Field(default=None, max_length=50)
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    role: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=255)
    base_salary: float | None = Field(default=None, ge=0)
    emirates_id: str | None = Field(default=None, max_length=50)
    passport_no: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None


class EmployeeResponse(BaseModel):
    # Deliberately standalone rather than inheriting EmployeeCreate -- see
    # CustomerResponse in schemas/customer.py for why a response must never
    # carry input-validation constraints.
    id: int
    business_id: int
    name: str
    role: str | None
    phone_code: str | None
    phone: str | None
    email: str | None
    base_salary: float | None
    emirates_id: str | None
    emirates_id_attachment_path: str | None
    passport_no: str | None
    passport_attachment_path: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class EmployeeDocumentResponse(BaseModel):
    id: int
    name: str
    file_path: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class EmployeeSalaryEntry(BaseModel):
    id: int
    amount: Decimal
    date: datetime.date
    is_paid: bool
    paid_on: datetime.date | None
    description: str | None
    recurring_expense_id: int | None
    # The absence deduction on this payment (see services/salary_deductions).
    deduction: DeductionSummary | None = None

    model_config = {"from_attributes": True}


class EmployeeDetailResponse(BaseModel):
    """Everything about one person in one place -- their record, whether they
    have a login, the standing monthly salary the system is generating, and
    what has actually been paid versus what is still owed."""

    employee: EmployeeResponse
    # The linked login account, if this person has one at all.
    user_id: int | None = None
    username: str | None = None
    user_role: str | None = None
    # Attendance tallies over the current month, so the detail view answers
    # "are they turning up?" as well as "have they been paid?".
    present_days: int = 0
    absent_days: int = 0
    half_days: int = 0
    leave_days: int = 0
    # Salary
    recurring_salary_amount: float | None = None
    total_paid: float = 0
    total_pending: float = 0
    salary_entries: list[EmployeeSalaryEntry] = []
    # Anything attached beyond the Emirates ID and passport scans.
    documents: list[EmployeeDocumentResponse] = []
