from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class ServiceCategory(TimestampMixin, Base):
    __tablename__ = "service_categories"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Service(TimestampMixin, Base):
    __tablename__ = "services"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    code: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    govt_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    # Bank Fee / E-Drh (E-Dirham channel) Fee — additional government-adjacent
    # pass-through charges, tracked the same way govt_fee already is (a
    # per-unit amount added on top of price, non-VAT-taxable). Introduced for
    # HASSAS's exact invoice/quotation template, whose line-item table breaks
    # these out as their own columns — see services/invoice_calc.py.
    bank_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    edrh_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("service_categories.id"), nullable=True)
    taxable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
