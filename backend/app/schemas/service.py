from pydantic import BaseModel, Field

# String length caps mirror app/models/service.py's column lengths;
# price/fee fields get a floor of 0 -- a negative price or fee has no
# legitimate meaning here and would silently corrupt invoice totals.


class ServiceCategoryBase(BaseModel):
    name: str = Field(max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class ServiceCategoryCreate(ServiceCategoryBase):
    pass


class ServiceCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class ServiceCategoryResponse(BaseModel):
    # See CustomerResponse in schemas/customer.py for why this is its own
    # class rather than ServiceCategoryResponse(ServiceCategoryBase) --
    # response schemas must tolerate data written before these length caps
    # existed, not re-validate it against them.
    id: int
    business_id: int
    name: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class ServiceBase(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    price: float = Field(default=0, ge=0)
    govt_fee: float = Field(default=0, ge=0)
    bank_fee: float = Field(default=0, ge=0)
    edrh_fee: float = Field(default=0, ge=0)
    category_id: int | None = None
    taxable: bool = True
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    price: float | None = Field(default=None, ge=0)
    govt_fee: float | None = Field(default=None, ge=0)
    bank_fee: float | None = Field(default=None, ge=0)
    edrh_fee: float | None = Field(default=None, ge=0)
    category_id: int | None = None
    taxable: bool | None = None
    is_active: bool | None = None


class ServiceResponse(BaseModel):
    # See CustomerResponse in schemas/customer.py for why this is its own
    # class rather than ServiceResponse(ServiceBase).
    id: int
    business_id: int
    code: str | None
    name: str
    description: str | None
    price: float
    govt_fee: float
    bank_fee: float
    edrh_fee: float
    category_id: int | None
    taxable: bool
    is_active: bool

    model_config = {"from_attributes": True}


class PaginatedServices(BaseModel):
    items: list[ServiceResponse]
    total: int
    page: int
    page_size: int
