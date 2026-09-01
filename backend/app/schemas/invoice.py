from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.invoice import ClearedStatus, InvoiceStatus, PaymentMethod


class InvoiceItemCreate(BaseModel):
    service_id: int | None = None
    description: str | None = None
    qty: float = 1
    unit_price: float | None = None
    govt_fee: float | None = None
    discount: float = 0
    vat_rate: float | None = None
    save_as_service: bool = False
    category_id: int | None = None

    @model_validator(mode="after")
    def check_adhoc_fields(self):
        if self.service_id is None:
            if not self.description:
                raise ValueError("description is required for an ad-hoc line item")
            if self.unit_price is None:
                raise ValueError("unit_price is required for an ad-hoc line item")
        return self


class InvoiceItemResponse(BaseModel):
    id: int
    service_id: int | None
    description: str
    qty: float
    unit_price: float
    govt_fee: float
    discount: float
    vat_rate: float
    line_total: float

    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    method: str
    paid_on: date
    reference: str | None = None
    payment_method: PaymentMethod = PaymentMethod.cash


class PaymentResponse(BaseModel):
    id: int
    invoice_id: int
    amount: float
    method: str
    paid_on: date
    reference: str | None
    payment_method: PaymentMethod
    cleared_status: ClearedStatus
    received_at: date | None

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    customer_id: int
    employee_customer_id: int | None = None
    payment_method: PaymentMethod
    invoice_date: date
    due_date: date | None = None
    notes: str | None = None
    terms: str | None = None
    show_bank_details: bool = False
    coupon_code: str | None = None
    items: list[InvoiceItemCreate]

    @model_validator(mode="after")
    def check_items(self):
        if not self.items:
            raise ValueError("An invoice needs at least one line item")
        return self


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceResponse(BaseModel):
    id: int
    business_id: int
    number: str
    customer_id: int
    employee_customer_id: int | None
    payment_method: PaymentMethod
    invoice_date: date
    due_date: date | None
    status: InvoiceStatus
    subtotal: float
    discount_total: float
    coupon_id: int | None
    vat_total: float
    govt_fee_total: float
    grand_total: float
    amount_paid: float
    notes: str | None
    terms: str | None
    show_bank_details: bool
    items: list[InvoiceItemResponse]
    payments: list[PaymentResponse]

    model_config = {"from_attributes": True}


class InvoiceListItem(BaseModel):
    id: int
    number: str
    customer_id: int
    payment_method: PaymentMethod
    invoice_date: date
    due_date: date | None
    status: InvoiceStatus
    grand_total: float
    amount_paid: float

    model_config = {"from_attributes": True}


class PaginatedInvoices(BaseModel):
    items: list[InvoiceListItem]
    total: int
    page: int
    page_size: int


class InvoiceKpis(BaseModel):
    total_count: int
    total_amount: float
    pending_count: int
    pending_amount: float
    paid_count: int
    paid_amount: float
    overdue_count: int
    overdue_amount: float
    void_count: int
    void_amount: float


class ReconciliationEntry(BaseModel):
    payment_id: int
    invoice_id: int
    invoice_number: str
    customer_name: str
    payment_method: PaymentMethod
    amount: float
    paid_on: date
    cleared_status: ClearedStatus
    received_at: date | None


class ReconciliationResponse(BaseModel):
    date: date
    entries: list[ReconciliationEntry]
    total_collected: float
    total_pending: float
