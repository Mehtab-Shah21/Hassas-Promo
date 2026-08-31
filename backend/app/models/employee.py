from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class Employee(TimestampMixin, Base):
    """The Attendance module's own roster — not app login users. Lets staff
    without a login (or shared across both businesses under different
    roles) still have their attendance tracked. Scoped per business, same
    as customers/services, so Main and IIM keep separate rosters."""

    __tablename__ = "employees"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str | None] = mapped_column(String(100))
    phone_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
