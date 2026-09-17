from pydantic import BaseModel, Field

# String length caps mirror app/models/business.py's column lengths.


class BusinessBase(BaseModel):
    name: str = Field(max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=100)
    cr_no: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    bank_account_name: str | None = Field(default=None, max_length=255)
    bank_iban_or_no: str | None = Field(default=None, max_length=100)
    bank_swift: str | None = Field(default=None, max_length=50)
    bank_name: str | None = Field(default=None, max_length=255)
    logo_path: str | None = Field(default=None, max_length=500)
    base_currency: str = Field(default="AED", max_length=10)
    currency_display: str = Field(default="symbol", max_length=10)
    date_format: str = Field(default="DD/MM/YYYY", max_length=30)
    timezone: str = Field(default="Asia/Dubai", max_length=50)
    invoice_prefix: str = Field(default="INV-", max_length=20)
    quotation_prefix: str = Field(default="QTN-", max_length=20)
    show_govt_fee_on_invoice: bool = False
    default_vat_rate: float = Field(default=0, ge=0, le=100)
    default_invoice_notes_cash: str | None = Field(default=None, max_length=2000)
    default_invoice_terms_cash: str | None = Field(default=None, max_length=2000)
    default_invoice_notes_credit: str | None = Field(default=None, max_length=2000)
    default_invoice_terms_credit: str | None = Field(default=None, max_length=2000)
    default_quotation_validity_days: int = Field(default=30, ge=1, le=3650)
    default_quotation_notes: str | None = Field(default=None, max_length=2000)
    default_quotation_terms: str | None = Field(default=None, max_length=2000)
    template_config: dict | None = None
    custom_invoice_template: str | None = Field(default=None, max_length=50)
    thermal_paper_width: str = Field(default="80mm", max_length=10)
    thermal_template_config: dict | None = None
    is_active: bool = True


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=100)
    cr_no: str | None = Field(default=None, max_length=100)
    phone_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    bank_account_name: str | None = Field(default=None, max_length=255)
    bank_iban_or_no: str | None = Field(default=None, max_length=100)
    bank_swift: str | None = Field(default=None, max_length=50)
    bank_name: str | None = Field(default=None, max_length=255)
    logo_path: str | None = Field(default=None, max_length=500)
    base_currency: str | None = Field(default=None, max_length=10)
    currency_display: str | None = Field(default=None, max_length=10)
    date_format: str | None = Field(default=None, max_length=30)
    timezone: str | None = Field(default=None, max_length=50)
    invoice_prefix: str | None = Field(default=None, max_length=20)
    quotation_prefix: str | None = Field(default=None, max_length=20)
    show_govt_fee_on_invoice: bool | None = None
    default_vat_rate: float | None = Field(default=None, ge=0, le=100)
    default_invoice_notes_cash: str | None = Field(default=None, max_length=2000)
    default_invoice_terms_cash: str | None = Field(default=None, max_length=2000)
    default_invoice_notes_credit: str | None = Field(default=None, max_length=2000)
    default_invoice_terms_credit: str | None = Field(default=None, max_length=2000)
    default_quotation_validity_days: int | None = Field(default=None, ge=1, le=3650)
    default_quotation_notes: str | None = Field(default=None, max_length=2000)
    default_quotation_terms: str | None = Field(default=None, max_length=2000)
    template_config: dict | None = None
    custom_invoice_template: str | None = Field(default=None, max_length=50)
    thermal_paper_width: str | None = Field(default=None, max_length=10)
    thermal_template_config: dict | None = None
    is_active: bool | None = None


class BusinessResponse(BaseModel):
    # See CustomerResponse in schemas/customer.py for why this is its own
    # class rather than BusinessResponse(BusinessBase).
    id: int
    name: str
    legal_name: str | None
    tax_id: str | None
    cr_no: str | None
    phone_code: str | None
    phone: str | None
    email: str | None
    website: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    bank_account_name: str | None
    bank_iban_or_no: str | None
    bank_swift: str | None
    bank_name: str | None
    logo_path: str | None
    base_currency: str
    currency_display: str
    date_format: str
    timezone: str
    invoice_prefix: str
    quotation_prefix: str
    show_govt_fee_on_invoice: bool
    default_vat_rate: float
    default_invoice_notes_cash: str | None
    default_invoice_terms_cash: str | None
    default_invoice_notes_credit: str | None
    default_invoice_terms_credit: str | None
    default_quotation_validity_days: int
    default_quotation_notes: str | None
    default_quotation_terms: str | None
    template_config: dict | None
    custom_invoice_template: str | None
    thermal_paper_width: str
    thermal_template_config: dict | None
    is_active: bool

    model_config = {"from_attributes": True}
