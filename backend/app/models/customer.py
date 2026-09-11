import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class CustomerType(str, enum.Enum):
    individual = "individual"
    company = "company"


class IdKind(str, enum.Enum):
    vat_tax = "vat_tax"
    national_id = "national_id"


class Emirate(str, enum.Enum):
    abu_dhabi = "Abu Dhabi"
    dubai = "Dubai"
    sharjah = "Sharjah"
    ajman = "Ajman"
    umm_al_quwain = "Umm Al Quwain"
    fujairah = "Fujairah"
    ras_al_khaimah = "Ras Al Khaimah"


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    type: Mapped[CustomerType] = mapped_column(Enum(CustomerType), nullable=False, default=CustomerType.individual)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))

    parent_customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"), nullable=True, index=True
    )

    id_kind: Mapped[IdKind | None] = mapped_column(Enum(IdKind))
    id_value: Mapped[str | None] = mapped_column(String(100))

    address_line1: Mapped[str | None] = mapped_column(String(255))
    # address_line2/city/state/postal_code/country are no longer collected by
    # the form (client asked to drop them from the UI) but stay in the schema
    # so existing customer data is never destroyed — see the migration that
    # added `emirate` for the data-preserving rationale.
    address_line2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(100))
    emirate: Mapped[Emirate | None] = mapped_column(
        Enum(Emirate, values_callable=lambda e: [m.value for m in e])
    )
    notes: Mapped[str | None] = mapped_column(String(2000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
