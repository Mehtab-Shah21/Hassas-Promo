import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class DiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class CouponKind(str, enum.Enum):
    # Takes money off the invoice it's applied to.
    discount = "discount"
    # Prints a banner image on the invoice (e.g. a partner offer the customer
    # redeems elsewhere). Discounts nothing — discount_type/value are fixed/0.
    banner = "banner"


class Coupon(TimestampMixin, Base):
    __tablename__ = "coupons"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    kind: Mapped[CouponKind] = mapped_column(
        Enum(CouponKind, native_enum=False, length=20),
        default=CouponKind.discount,
        server_default="discount",
        nullable=False,
    )
    # Only for kind=banner: the uploaded artwork, served from /uploads.
    banner_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    discount_type: Mapped[DiscountType] = mapped_column(Enum(DiscountType), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    # max_uses=None means unlimited. Once times_used reaches max_uses, the
    # coupon is auto-deactivated (is_active flips to False) — see
    # _resolve_coupon/_apply_coupon_usage in routers/invoices.py and
    # routers/quotations.py.
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    times_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
