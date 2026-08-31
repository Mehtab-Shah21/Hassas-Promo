from sqlalchemy import JSON, Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class Business(TimestampMixin, Base):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255))
    tax_id: Mapped[str | None] = mapped_column(String(100))
    cr_no: Mapped[str | None] = mapped_column(String(100))

    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))

    address_line1: Mapped[str | None] = mapped_column(String(255))
    address_line2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(100))

    bank_account_name: Mapped[str | None] = mapped_column(String(255))
    bank_iban_or_no: Mapped[str | None] = mapped_column(String(100))
    bank_swift: Mapped[str | None] = mapped_column(String(50))
    bank_name: Mapped[str | None] = mapped_column(String(255))

    logo_path: Mapped[str | None] = mapped_column(String(500))
    base_currency: Mapped[str] = mapped_column(String(10), default="AED", nullable=False)
    currency_display: Mapped[str] = mapped_column(String(10), default="symbol", nullable=False)
    date_format: Mapped[str] = mapped_column(String(30), default="DD/MM/YYYY", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Dubai", nullable=False)

    invoice_prefix: Mapped[str] = mapped_column(String(20), default="INV-", nullable=False)
    next_invoice_no: Mapped[int] = mapped_column(default=1, nullable=False)
    quotation_prefix: Mapped[str] = mapped_column(String(20), default="QTN-", nullable=False)
    next_quotation_no: Mapped[int] = mapped_column(default=1, nullable=False)

    show_govt_fee_on_invoice: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)

    default_invoice_notes_cash: Mapped[str | None] = mapped_column(String(2000))
    default_invoice_terms_cash: Mapped[str | None] = mapped_column(String(2000))
    default_invoice_notes_credit: Mapped[str | None] = mapped_column(String(2000))
    default_invoice_terms_credit: Mapped[str | None] = mapped_column(String(2000))
    default_quotation_validity_days: Mapped[int] = mapped_column(default=30, nullable=False)
    default_quotation_notes: Mapped[str | None] = mapped_column(String(2000))
    default_quotation_terms: Mapped[str | None] = mapped_column(String(2000))

    template_config: Mapped[dict | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Thermal receipt printing. thermal_paper_width is a hardware/printer
    # setting (which roll is loaded) so it lives in Settings; thermal_template_config
    # is the receipt's own design config (separate from the A4 template_config
    # above), set from Design Studio's "Thermal Receipt" tab.
    thermal_paper_width: Mapped[str] = mapped_column(String(10), default="80mm", nullable=False)
    thermal_template_config: Mapped[dict | None] = mapped_column(JSON)
