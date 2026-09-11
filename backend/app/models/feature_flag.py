from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class FeatureFlag(TimestampMixin, Base):
    __tablename__ = "feature_flags"
    __table_args__ = (UniqueConstraint("business_id", "key", name="uq_feature_flags_business_key"),)

    # NULL business_id = a global, install-wide flag (currently just "iim" —
    # whether the IIM business exists at all isn't a per-business module
    # setting). Every per-business module flag (coupons, quotations, etc.)
    # has one row per business, so Main and IIM can differ independently.
    business_id: Mapped[int | None] = mapped_column(ForeignKey("businesses.id"), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
