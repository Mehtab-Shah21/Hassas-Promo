from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.models.attendance import Attendance, AttendanceStatus
from app.models.customer import Customer
from app.models.employee import Employee
from app.models.feature_flag import FeatureFlag
from app.models.invoice import Invoice, InvoiceStatus
from app.schemas.dashboard import DashboardSummary, RecentInvoice, TopCustomer
from app.services.reconciliation import build_reconciliation_query, totals_from_payments

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _period_bounds(period: str) -> tuple[date | None, date | None]:
    today = date.today()
    if period == "month":
        return today.replace(day=1), today
    if period == "year":
        return today.replace(month=1, day=1), today
    return None, None  # "all"


def _module_enabled(db: Session, business_id: int, key: str) -> bool:
    flag = db.query(FeatureFlag).filter(FeatureFlag.business_id == business_id, FeatureFlag.key == key).first()
    return flag is None or flag.enabled


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    period: str = Query(default="month", pattern="^(month|year|all)$"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    date_from, date_to = _period_bounds(period)

    period_q = db.query(Invoice).filter(Invoice.business_id == business_id, Invoice.status != InvoiceStatus.void)
    if date_from:
        period_q = period_q.filter(Invoice.invoice_date >= date_from, Invoice.invoice_date <= date_to)
    period_invoices = period_q.all()

    total_sales = round(sum(float(i.grand_total) for i in period_invoices), 2)
    vat_collected = round(sum(float(i.vat_total) for i in period_invoices), 2)

    govt_fees_paid_to_date = round(
        db.query(func.coalesce(func.sum(Invoice.govt_fee_total), 0))
        .filter(Invoice.business_id == business_id, Invoice.status != InvoiceStatus.void)
        .scalar()
        or 0,
        2,
    )

    recent = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id)
        .order_by(Invoice.created_at.desc())
        .limit(10)
        .all()
    )
    customer_names = {c.id: c.name for c in db.query(Customer).filter(Customer.business_id == business_id).all()}
    recent_invoices = [
        RecentInvoice(
            id=inv.id,
            number=inv.number,
            customer_name=customer_names.get(inv.customer_id, "—"),
            invoice_date=inv.invoice_date.isoformat(),
            status=inv.status.value,
            grand_total=float(inv.grand_total),
        )
        for inv in recent
    ]

    top_map: dict[int, dict] = {}
    for inv in period_invoices:
        entry = top_map.setdefault(inv.customer_id, {"total_amount": 0.0, "invoice_count": 0})
        entry["total_amount"] += float(inv.grand_total)
        entry["invoice_count"] += 1
    top_sorted = sorted(top_map.items(), key=lambda kv: kv[1]["total_amount"], reverse=True)[:5]
    top_customers = [
        TopCustomer(
            customer_id=cid,
            customer_name=customer_names.get(cid, "—"),
            total_amount=round(data["total_amount"], 2),
            invoice_count=data["invoice_count"],
        )
        for cid, data in top_sorted
    ]

    attendance_present_today: int | None = None
    attendance_absent_today: int | None = None
    if _module_enabled(db, business_id, "attendance"):
        today = date.today()
        employees = db.query(Employee).filter(Employee.business_id == business_id, Employee.is_active.is_(True)).all()
        today_records = {
            a.employee_id: a.status
            for a in db.query(Attendance).filter(Attendance.business_id == business_id, Attendance.date == today).all()
        }
        attendance_present_today = sum(1 for e in employees if today_records.get(e.id) == AttendanceStatus.present)
        attendance_absent_today = sum(1 for e in employees if today_records.get(e.id) == AttendanceStatus.absent)

    # Same query/calculation the Reconciliation page uses (see
    # services/reconciliation.py): collected follows this dashboard's own
    # period toggle, pending is deliberately unbounded (all-time) so old
    # uncleared payments keep showing regardless of the selected period.
    reconciliation_collected = 0.0
    reconciliation_pending = 0.0
    if _module_enabled(db, business_id, "reconciliation"):
        period_payments = build_reconciliation_query(db, business_id, date_from, date_to).all()
        reconciliation_collected, _ = totals_from_payments(period_payments)
        all_time_payments = build_reconciliation_query(db, business_id).all()
        _, reconciliation_pending = totals_from_payments(all_time_payments)

    return DashboardSummary(
        period=period,
        total_sales=total_sales,
        invoice_count=len(period_invoices),
        govt_fees_paid_to_date=govt_fees_paid_to_date,
        vat_collected=vat_collected,
        recent_invoices=recent_invoices,
        top_customers=top_customers,
        attendance_present_today=attendance_present_today,
        attendance_absent_today=attendance_absent_today,
        reconciliation_collected=reconciliation_collected,
        reconciliation_pending=reconciliation_pending,
    )
