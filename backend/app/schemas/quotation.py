from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.quotation import QuotationStatus
from app.schemas.invoice import InvoiceItemCreate, InvoiceItemResponse

# Mirrors app/schemas/invoice.py's InvoiceCreate bounds -- see that file's
# module comment for why.


class QuotationCreate(BaseModel):
    customer_id: int
    employee_customer_id: int | None = None
    quotation_date: date
    validity_days: int | None = Field(default=None, ge=1, le=3650)
    notes: str | None = Field(default=None, max_length=2000)
    terms: str | None = Field(default=None, max_length=2000)
    show_bank_details: bool = False
    coupon_code: str | None = Field(default=None, max_length=50)
    # Same as InvoiceCreate.auto_reference_numbers, keyed off the quotation number.
    auto_reference_numbers: bool = False
    items: list[InvoiceItemCreate] = Field(max_length=500)

    @model_validator(mode="after")
    def check_items(self):
        if not self.items:
            raise ValueError("A quotation needs at least one line item")
        return self


class QuotationStatusUpdate(BaseModel):
    status: QuotationStatus


class QuotationResponse(BaseModel):
    id: int
    business_id: int
    number: str
    customer_id: int
    employee_customer_id: int | None
    quotation_date: date
    validity_days: int
    valid_until: date
    status: QuotationStatus
    subtotal: float
    discount_total: float
    coupon_id: int | None
    vat_total: float
    govt_fee_total: float
    bank_fee_total: float
    edrh_fee_total: float
    grand_total: float
    notes: str | None
    terms: str | None
    show_bank_details: bool
    converted_invoice_id: int | None
    items: list[InvoiceItemResponse]

    model_config = {"from_attributes": True}


class QuotationListItem(BaseModel):
    id: int
    number: str
    customer_id: int
    quotation_date: date
    valid_until: date
    status: QuotationStatus
    grand_total: float
    converted_invoice_id: int | None

    model_config = {"from_attributes": True}


class PaginatedQuotations(BaseModel):
    items: list[QuotationListItem]
    total: int
    page: int
    page_size: int
