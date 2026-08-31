from pydantic import BaseModel


class EmployeeCreate(BaseModel):
    name: str
    role: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class EmployeeResponse(BaseModel):
    id: int
    business_id: int
    name: str
    role: str | None
    phone_code: str | None
    phone: str | None
    is_active: bool

    model_config = {"from_attributes": True}
