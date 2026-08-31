from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.notification import ReminderUnit


class ReminderCreate(BaseModel):
    offset_value: int
    offset_unit: ReminderUnit


class ReminderResponse(BaseModel):
    id: int
    offset_value: int
    offset_unit: ReminderUnit

    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    customer_id: int
    service_id: int
    note: str | None = None
    target_date: date
    visibility_modules: list[str] = []
    reminders: list[ReminderCreate] = []


class NotificationUpdate(BaseModel):
    service_id: int | None = None
    note: str | None = None
    target_date: date | None = None
    visibility_modules: list[str] | None = None


class SnoozeRequest(BaseModel):
    days: int = 3


class NotificationResponse(BaseModel):
    id: int
    business_id: int
    customer_id: int
    service_id: int | None
    note: str | None
    target_date: date
    acknowledged_at: datetime | None
    snoozed_until: date | None
    visibility_modules: list[str]
    reminders: list[ReminderResponse]

    model_config = {"from_attributes": True}

    @field_validator("visibility_modules", mode="before")
    @classmethod
    def _default_visibility_modules(cls, v: list[str] | None) -> list[str]:
        return v or []


class NotificationListItem(BaseModel):
    id: int
    customer_id: int
    customer_name: str
    service_id: int | None
    service_name: str
    note: str | None
    target_date: date
    acknowledged_at: datetime | None
    snoozed_until: date | None
    visibility_modules: list[str]
    days_remaining: int
    triggered: bool


class BadgeResponse(BaseModel):
    count: int
