import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.mixins import TimestampMixin


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    online = "online"


class ClearedStatus(str, enum.Enum):
    pending = "pending"
    received = "received"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    paid = "paid"
    partial = "partial"
    overdue = "overdue"
    void = "void"


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    employee_customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)

    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.cash)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[InvoiceStatus] = mapped_column(Enum(InvoiceStatus), default=InvoiceStatus.draft, nullable=False)

    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    coupon_id: Mapped[int | None] = mapped_column(ForeignKey("coupons.id"), nullable=True)
    vat_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    govt_fee_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(String(2000))
    terms: Mapped[str | None] = mapped_column(String(2000))
    show_bank_details: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    items: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceItem.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="Payment.paid_on"
    )


class InvoiceItem(TimestampMixin, Base):
    __tablename__ = "invoice_items"

    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), nullable=False, index=True)
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id"), nullable=True)

    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    govt_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    invoice: Mapped[Invoice] = relationship(back_populates="items")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255))

    # payment_method is the coarse cash|card|online bucket reconciliation
    # groups by; `method` above stays free-text (bank_transfer/cheque/other)
    # for the existing manual "record a payment" flow. Cash clears
    # immediately; card/online start pending until an admin marks them
    # received in the Reconciliation view.
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.cash)
    cleared_status: Mapped[ClearedStatus] = mapped_column(Enum(ClearedStatus), nullable=False, default=ClearedStatus.received)
    received_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")
