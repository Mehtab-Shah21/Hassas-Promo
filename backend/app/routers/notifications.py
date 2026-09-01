import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id
from app.models.customer import Customer
from app.models.notification import Notification, NotificationReminder, ReminderUnit
from app.models.service import Service
from app.schemas.notification import (
    BadgeResponse,
    NotificationCreate,
    NotificationListItem,
    NotificationResponse,
    NotificationUpdate,
    SnoozeRequest,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _subtract(d: date, value: int, unit: ReminderUnit) -> date:
    if unit == ReminderUnit.day:
        return d - timedelta(days=value)
    if unit == ReminderUnit.week:
        return d - timedelta(weeks=value)
    # month: clamp day to the target month's length
    month_index = d.month - 1 - value
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _earliest_trigger(notification: Notification) -> date:
    dates = [_subtract(notification.target_date, r.offset_value, r.offset_unit) for r in notification.reminders]
    dates.append(notification.target_date)
    return min(dates)


def _is_triggered(notification: Notification, today: date) -> bool:
    if notification.acknowledged_at is not None:
        return False
    if notification.snoozed_until and notification.snoozed_until > today:
        return False
    return _earliest_trigger(notification) <= today


def _to_list_item(n: Notification, customer_names: dict[int, str], service_names: dict[int, str], today: date) -> NotificationListItem:
    return NotificationListItem(
        id=n.id,
        customer_id=n.customer_id,
        customer_name=customer_names.get(n.customer_id, "—"),
        service_id=n.service_id,
        service_name=service_names.get(n.service_id, "—") if n.service_id else "—",
        note=n.note,
        target_date=n.target_date,
        acknowledged_at=n.acknowledged_at,
        snoozed_until=n.snoozed_until,
        visibility_modules=n.visibility_modules or [],
        days_remaining=(n.target_date - today).days,
        triggered=_is_triggered(n, today),
    )


@router.get("", response_model=list[NotificationListItem])
def list_notifications(
    unacknowledged_only: bool = False,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Notification).options(selectinload(Notification.reminders)).filter(Notification.business_id == business_id)
    if unacknowledged_only:
        q = q.filter(Notification.acknowledged_at.is_(None))
    notifications = q.order_by(Notification.target_date).all()

    customer_names = {c.id: c.name for c in db.query(Customer).filter(Customer.business_id == business_id).all()}
    service_names = {s.id: s.name for s in db.query(Service).filter(Service.business_id == business_id).all()}
    today = date.today()

    return [_to_list_item(n, customer_names, service_names, today) for n in notifications]


@router.get("/active", response_model=list[NotificationListItem])
def list_active_notifications(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Currently triggered, unacknowledged notifications — drives the top-bar
    bell panel and the per-module nav red-dot indicators."""
    notifications = (
        db.query(Notification)
        .options(selectinload(Notification.reminders))
        .filter(Notification.business_id == business_id, Notification.acknowledged_at.is_(None))
        .order_by(Notification.target_date)
        .all()
    )
    customer_names = {c.id: c.name for c in db.query(Customer).filter(Customer.business_id == business_id).all()}
    service_names = {s.id: s.name for s in db.query(Service).filter(Service.business_id == business_id).all()}
    today = date.today()

    return [
        _to_list_item(n, customer_names, service_names, today)
        for n in notifications
        if _is_triggered(n, today)
    ]


@router.get("/badge", response_model=BadgeResponse)
def badge(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notifications = (
        db.query(Notification)
        .options(selectinload(Notification.reminders))
        .filter(Notification.business_id == business_id, Notification.acknowledged_at.is_(None))
        .all()
    )
    today = date.today()
    count = sum(1 for n in notifications if _is_triggered(n, today))
    return BadgeResponse(count=count)


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    customer = db.get(Customer, payload.customer_id)
    if not customer or customer.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    if payload.service_id is not None:
        service = db.get(Service, payload.service_id)
        if not service or service.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service not found")

    notification = Notification(
        business_id=business_id,
        customer_id=payload.customer_id,
        service_id=payload.service_id,
        note=payload.note,
        target_date=payload.target_date,
        visibility_modules=payload.visibility_modules,
        created_by=current_user.id,
        reminders=[
            NotificationReminder(offset_value=r.offset_value, offset_unit=r.offset_unit) for r in payload.reminders
        ],
    )
    db.add(notification)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="notification", entity_id=notification.id,
        description=f"Created notification for {customer.name} targeting {notification.target_date}",
    )
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/{notification_id}", response_model=NotificationResponse)
def update_notification(
    notification_id: int,
    payload: NotificationUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)
    if not notification or notification.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("service_id") is not None:
        service = db.get(Service, data["service_id"])
        if not service or service.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service not found")
    for field, value in data.items():
        setattr(notification, field, value)
    if "target_date" in data:
        # Renewing the target date naturally clears a stale alert.
        notification.acknowledged_at = None
        notification.snoozed_until = None
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/{notification_id}/acknowledge", response_model=NotificationResponse)
def acknowledge(
    notification_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)
    if not notification or notification.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.acknowledged_at = datetime.utcnow()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="acknowledge",
        entity_type="notification", entity_id=notification.id, description="Acknowledged notification",
    )
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/{notification_id}/snooze", response_model=NotificationResponse)
def snooze(
    notification_id: int,
    payload: SnoozeRequest,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)
    if not notification or notification.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.snoozed_until = date.today() + timedelta(days=payload.days)
    db.commit()
    db.refresh(notification)
    return notification


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)
    if not notification or notification.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    db.delete(notification)
    db.commit()
