import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.mixins import TimestampMixin


class QuotationStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    accepted = "accepted"
    rejected = "rejected"
    converted = "converted"


class Quotation(TimestampMixin, Base):
    __tablename__ = "quotations"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    employee_customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)

    quotation_date: Mapped[date] = mapped_column(Date, nullable=False)
    validity_days: Mapped[int] = mapped_column(default=30, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[QuotationStatus] = mapped_column(Enum(QuotationStatus), default=QuotationStatus.draft, nullable=False)

    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    coupon_id: Mapped[int | None] = mapped_column(ForeignKey("coupons.id"), nullable=True)
    vat_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    govt_fee_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    bank_fee_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    edrh_fee_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(String(2000))
    terms: Mapped[str | None] = mapped_column(String(2000))
    show_bank_details: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    converted_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)

    items: Mapped[list["QuotationItem"]] = relationship(
        back_populates="quotation", cascade="all, delete-orphan", order_by="QuotationItem.id"
    )


class QuotationItem(TimestampMixin, Base):
    __tablename__ = "quotation_items"

    quotation_id: Mapped[int] = mapped_column(ForeignKey("quotations.id"), nullable=False, index=True)
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id"), nullable=True)

    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    govt_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    bank_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    edrh_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    trans_no: Mapped[str | None] = mapped_column(String(100))
    inv_no: Mapped[str | None] = mapped_column(String(100))
    # Percentage of the line's gross, with the resulting amount in discount —
    # see InvoiceItem for why both are stored.
    discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    quotation: Mapped[Quotation] = relationship(back_populates="items")
