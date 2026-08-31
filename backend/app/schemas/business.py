from pydantic import BaseModel


class BusinessBase(BaseModel):
    name: str
    legal_name: str | None = None
    tax_id: str | None = None
    cr_no: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    bank_account_name: str | None = None
    bank_iban_or_no: str | None = None
    bank_swift: str | None = None
    bank_name: str | None = None
    logo_path: str | None = None
    base_currency: str = "AED"
    currency_display: str = "symbol"
    date_format: str = "DD/MM/YYYY"
    timezone: str = "Asia/Dubai"
    invoice_prefix: str = "INV-"
    quotation_prefix: str = "QTN-"
    show_govt_fee_on_invoice: bool = False
    default_vat_rate: float = 0
    default_invoice_notes_cash: str | None = None
    default_invoice_terms_cash: str | None = None
    default_invoice_notes_credit: str | None = None
    default_invoice_terms_credit: str | None = None
    default_quotation_validity_days: int = 30
    default_quotation_notes: str | None = None
    default_quotation_terms: str | None = None
    template_config: dict | None = None
    thermal_paper_width: str = "80mm"
    thermal_template_config: dict | None = None
    is_active: bool = True


class BusinessUpdate(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    tax_id: str | None = None
    cr_no: str | None = None
    phone_code: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    bank_account_name: str | None = None
    bank_iban_or_no: str | None = None
    bank_swift: str | None = None
    bank_name: str | None = None
    logo_path: str | None = None
    base_currency: str | None = None
    currency_display: str | None = None
    date_format: str | None = None
    timezone: str | None = None
    invoice_prefix: str | None = None
    quotation_prefix: str | None = None
    show_govt_fee_on_invoice: bool | None = None
    default_vat_rate: float | None = None
    default_invoice_notes_cash: str | None = None
    default_invoice_terms_cash: str | None = None
    default_invoice_notes_credit: str | None = None
    default_invoice_terms_credit: str | None = None
    default_quotation_validity_days: int | None = None
    default_quotation_notes: str | None = None
    default_quotation_terms: str | None = None
    template_config: dict | None = None
    thermal_paper_width: str | None = None
    thermal_template_config: dict | None = None
    is_active: bool | None = None


class BusinessResponse(BusinessBase):
    id: int

    model_config = {"from_attributes": True}
