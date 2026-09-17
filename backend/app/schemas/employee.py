from pydantic import BaseModel, Field

# Lengths mirror app/models/employee.py's column lengths.


class EmployeeCreate(BaseModel):
    name: str = Field(max_length=150)
    role: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    base_salary: float | None = Field(default=None, ge=0)
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    role: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    base_salary: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class EmployeeResponse(BaseModel):
    id: int
    business_id: int
    name: str
    role: str | None
    phone_code: str | None
    phone: str | None
    base_salary: float | None
    is_active: bool

    model_config = {"from_attributes": True}
