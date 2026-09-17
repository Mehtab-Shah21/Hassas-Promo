from pydantic import BaseModel, Field

from app.models.customer import CustomerType, Emirate, IdKind

# String length caps mirror app/models/customer.py's column lengths.


class CustomerBase(BaseModel):
    type: CustomerType = CustomerType.individual
    name: str = Field(max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    parent_customer_id: int | None = None
    id_kind: IdKind | None = None
    id_value: str | None = Field(default=None, max_length=100)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    emirate: Emirate | None = None
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    type: CustomerType | None = None
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    parent_customer_id: int | None = None
    id_kind: IdKind | None = None
    id_value: str | None = Field(default=None, max_length=100)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    emirate: Emirate | None = None
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class CustomerResponse(BaseModel):
    # Deliberately its own class, NOT CustomerResponse(CustomerBase) -- a
    # response echoes whatever is already stored, including rows written
    # before these length caps existed (SQLite never enforced its own
    # VARCHAR(n) limits, so such rows are a real possibility, not a
    # hypothetical one -- this exact class of bug broke GET /api/customers
    # on a pre-existing row during this security pass). Input validation
    # belongs on Create/Update; a response must never fail to serialize data
    # that's already sitting in the database.
    id: int
    business_id: int
    type: CustomerType
    name: str
    email: str | None
    phone_code: str | None
    phone: str | None
    parent_customer_id: int | None
    id_kind: IdKind | None
    id_value: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    emirate: Emirate | None
    notes: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class PaginatedCustomers(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
