from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.invoice import ClearedStatus, InvoiceStatus, PaymentMethod

# String lengths mirror app/models/invoice.py's column lengths. Numeric
# fields get floors matching what a real invoice line can mean -- qty/prices/
# fees can never be negative (a negative quantity or price would silently
# corrupt the line/invoice/report totals and would be a straightforward way
# to under-record a sale), and vat_rate is a percentage. Upper bounds are
# generous but finite, so a typo or a scripted attack can't produce an
# absurd (and PDF-breaking) number of trillions on an invoice line.


class InvoiceItemCreate(BaseModel):
    service_id: int | None = None
    description: str | None = Field(default=None, max_length=500)
    qty: float = Field(default=1, ge=0, le=1_000_000)
    unit_price: float | None = Field(default=None, ge=0, le=100_000_000)
    govt_fee: float | None = Field(default=None, ge=0, le=100_000_000)
    bank_fee: float | None = Field(default=None, ge=0, le=100_000_000)
    edrh_fee: float | None = Field(default=None, ge=0, le=100_000_000)
    trans_no: str | None = Field(default=None, max_length=100)
    inv_no: str | None = Field(default=None, max_length=100)
    # A percentage of the line's gross, not a currency amount — the server
    # converts it (see services/invoice_calc.discount_amount).
    discount_pct: float = Field(default=0, ge=0, le=100)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
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
    bank_fee: float
    edrh_fee: float
    trans_no: str | None
    inv_no: str | None
    discount_pct: float
    discount: float
    vat_rate: float
    line_total: float

    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0, le=100_000_000)
    method: str = Field(max_length=50)
    paid_on: date
    reference: str | None = Field(default=None, max_length=255)
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
    notes: str | None = Field(default=None, max_length=2000)
    terms: str | None = Field(default=None, max_length=2000)
    show_bank_details: bool = False
    coupon_code: str | None = Field(default=None, max_length=50)
    # A printed-banner coupon (coupons.kind = banner): prints its image on the
    # invoice and counts a use, but discounts nothing.
    banner_coupon_code: str | None = Field(default=None, max_length=50)
    # Fill any blank Trans No./Inv No. from the receipt number once it's
    # reserved — see services/numbering.auto_reference_numbers.
    auto_reference_numbers: bool = False
    # A single invoice is a physical page, not a spreadsheet import -- caps
    # the line count well above any real invoice while still bounding the
    # work one request can force the server (and the PDF renderer) to do.
    items: list[InvoiceItemCreate] = Field(max_length=500)

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
    banner_coupon_id: int | None = None
    vat_total: float
    govt_fee_total: float
    bank_fee_total: float
    edrh_fee_total: float
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
    date: date | None
    entries: list[ReconciliationEntry]
    total_collected: float
    total_pending: float
