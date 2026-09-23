from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_manager, require_module_enabled
from app.models.customer import Customer
from app.models.invoice import ClearedStatus, Invoice, Payment, PaymentMethod
from app.schemas.invoice import PaymentResponse, ReconciliationEntry, ReconciliationResponse
from app.services.audit import write_audit_log
from app.services.reconciliation import build_reconciliation_query, totals_from_payments

router = APIRouter(
    prefix="/api/reconciliation",
    tags=["reconciliation"],
    dependencies=[Depends(require_module_enabled("reconciliation"))],
)


@router.get("", response_model=ReconciliationResponse)
def get_reconciliation(
    for_date: date | None = Query(default=None, alias="date"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    scope: str = Query(default="day", pattern="^(day|range)$"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    # "day" (default) is the Reconciliation page's own single-date view,
    # unchanged from before. "range" is for the Dashboard's KPI cards: pass
    # date_from/date_to for a period-scoped total, or neither for a fully
    # unbounded (all-time) total — see services/reconciliation.py.
    if scope == "range":
        response_date = date_from
        query = build_reconciliation_query(db, business_id, date_from, date_to)
    else:
        response_date = for_date or date.today()
        query = build_reconciliation_query(db, business_id, response_date, response_date)

    payments = query.options(selectinload(Payment.invoice)).order_by(Payment.id).all()

    customer_names = {c.id: c.name for c in db.query(Customer).filter(Customer.business_id == business_id).all()}

    entries = [
        ReconciliationEntry(
            payment_id=p.id,
            invoice_id=p.invoice_id,
            invoice_number=p.invoice.number,
            customer_name=customer_names.get(p.invoice.customer_id, "—"),
            payment_method=p.payment_method,
            amount=float(p.amount),
            paid_on=p.paid_on,
            cleared_status=p.cleared_status,
            received_at=p.received_at,
        )
        for p in payments
    ]
    total_collected, total_pending = totals_from_payments(payments)

    return ReconciliationResponse(
        date=response_date, entries=entries, total_collected=total_collected, total_pending=total_pending
    )


@router.post("/payments/{payment_id}/receive", response_model=PaymentResponse)
def mark_payment_received(
    payment_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    payment = db.get(Payment, payment_id)
    if not payment or payment.invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.payment_method == PaymentMethod.cash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cash payments don't need clearance")

    payment.cleared_status = ClearedStatus.received
    payment.received_at = date.today()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="payment", entity_id=payment.id,
        description=f"Marked {payment.payment_method.value} payment of {payment.amount} on invoice {payment.invoice.number} as received",
    )
    db.commit()
    db.refresh(payment)
    return payment
