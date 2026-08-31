import enum
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.mixins import TimestampMixin


class ReminderUnit(str, enum.Enum):
    day = "day"
    week = "week"
    month = "month"


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id"), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(String(1000))
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    snoozed_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    visibility_modules: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    reminders: Mapped[list["NotificationReminder"]] = relationship(
        back_populates="notification", cascade="all, delete-orphan", order_by="NotificationReminder.id"
    )


class NotificationReminder(TimestampMixin, Base):
    __tablename__ = "notification_reminders"

    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"), nullable=False, index=True)
    offset_value: Mapped[int] = mapped_column(Integer, nullable=False)
    offset_unit: Mapped[ReminderUnit] = mapped_column(Enum(ReminderUnit), nullable=False)

    notification: Mapped[Notification] = relationship(back_populates="reminders")
