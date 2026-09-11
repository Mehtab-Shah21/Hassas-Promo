from pydantic import BaseModel

from app.models.customer import CustomerType, Emirate, IdKind


class CustomerBase(BaseModel):
    type: CustomerType = CustomerType.individual
    name: str
    email: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    parent_customer_id: int | None = None
    id_kind: IdKind | None = None
    id_value: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    emirate: Emirate | None = None
    notes: str | None = None
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    type: CustomerType | None = None
    name: str | None = None
    email: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    parent_customer_id: int | None = None
    id_kind: IdKind | None = None
    id_value: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    emirate: Emirate | None = None
    notes: str | None = None
    is_active: bool | None = None


class CustomerResponse(CustomerBase):
    id: int
    business_id: int

    model_config = {"from_attributes": True}


class PaginatedCustomers(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
