from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.models.attendance import Attendance
from app.models.customer import Customer
from app.models.employee import Employee
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.quotation import Quotation
from app.services.csv_export import rows_to_csv_response

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _month_bounds() -> tuple[date, date]:
    today = date.today()
    return today.replace(day=1), today


def _period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    if date_from and date_to:
        return date_from, date_to
    return _month_bounds()


def _customer_map(db: Session, business_id: int) -> dict[int, str]:
    return {c.id: c.name for c in db.query(Customer).filter(Customer.business_id == business_id).all()}


# --- 1. Sales report ---


@router.get("/sales")
def sales_report(
    view: str = Query(default="summary", pattern="^(summary|by_invoice|by_service)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id, Invoice.invoice_date >= d_from, Invoice.invoice_date <= d_to, Invoice.status != InvoiceStatus.void)
        .all()
    )

    if view == "summary":
        return {
            "date_from": d_from.isoformat(),
            "date_to": d_to.isoformat(),
            "invoice_count": len(invoices),
            "total_sales": round(sum(float(i.grand_total) for i in invoices), 2),
            "total_vat": round(sum(float(i.vat_total) for i in invoices), 2),
            "total_govt_fee": round(sum(float(i.govt_fee_total) for i in invoices), 2),
        }

    if view == "by_invoice":
        customers = _customer_map(db, business_id)
        rows = [
            {
                "number": i.number,
                "date": i.invoice_date.isoformat(),
                "customer": customers.get(i.customer_id, "—"),
                "payment_method": i.payment_method.value,
                "status": i.status.value,
                "total": float(i.grand_total),
            }
            for i in sorted(invoices, key=lambda x: x.invoice_date, reverse=True)
        ]
        if export == "csv":
            return rows_to_csv_response("sales_by_invoice.csv", ["number", "date", "customer", "payment_method", "status", "total"], rows)
        return rows

    # by_service
    items = db.query(InvoiceItem).join(Invoice, InvoiceItem.invoice_id == Invoice.id).filter(
        Invoice.business_id == business_id, Invoice.invoice_date >= d_from, Invoice.invoice_date <= d_to, Invoice.status != InvoiceStatus.void
    ).all()
    agg: dict[str, dict] = {}
    for it in items:
        key = it.description
        entry = agg.setdefault(key, {"service": key, "qty": 0.0, "revenue": 0.0})
        entry["qty"] += float(it.qty)
        entry["revenue"] += float(it.line_total)
    rows = sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)
    for r in rows:
        r["qty"] = round(r["qty"], 2)
        r["revenue"] = round(r["revenue"], 2)
    if export == "csv":
        return rows_to_csv_response("sales_by_service.csv", ["service", "qty", "revenue"], rows)
    return rows


# --- 2. Government fees paid ---


@router.get("/govt-fees")
def govt_fees_report(
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id, Invoice.invoice_date >= d_from, Invoice.invoice_date <= d_to, Invoice.status != InvoiceStatus.void, Invoice.govt_fee_total > 0)
        .all()
    )
    customers = _customer_map(db, business_id)
    rows = [
        {"number": i.number, "date": i.invoice_date.isoformat(), "customer": customers.get(i.customer_id, "—"), "govt_fee": float(i.govt_fee_total)}
        for i in sorted(invoices, key=lambda x: x.invoice_date, reverse=True)
    ]
    if export == "csv":
        return rows_to_csv_response("govt_fees.csv", ["number", "date", "customer", "govt_fee"], rows)
    return {"date_from": d_from.isoformat(), "date_to": d_to.isoformat(), "total_govt_fee": round(sum(r["govt_fee"] for r in rows), 2), "rows": rows}


# --- 3. VAT collected ---


@router.get("/vat")
def vat_report(
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id, Invoice.invoice_date >= d_from, Invoice.invoice_date <= d_to, Invoice.status != InvoiceStatus.void, Invoice.vat_total > 0)
        .all()
    )
    customers = _customer_map(db, business_id)
    rows = [
        {"number": i.number, "date": i.invoice_date.isoformat(), "customer": customers.get(i.customer_id, "—"), "vat": float(i.vat_total)}
        for i in sorted(invoices, key=lambda x: x.invoice_date, reverse=True)
    ]
    if export == "csv":
        return rows_to_csv_response("vat_collected.csv", ["number", "date", "customer", "vat"], rows)
    return {"date_from": d_from.isoformat(), "date_to": d_to.isoformat(), "total_vat": round(sum(r["vat"] for r in rows), 2), "rows": rows}


# --- 4. Outstanding / Aging ---


@router.get("/outstanding")
def outstanding_report(
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id, Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.partial]))
        .all()
    )
    customers = _customer_map(db, business_id)
    today = date.today()
    rows = []
    for i in invoices:
        balance = float(i.grand_total) - float(i.amount_paid)
        if balance <= 0:
            continue
        days_overdue = (today - i.due_date).days if i.due_date and i.due_date < today else 0
        rows.append(
            {
                "customer": customers.get(i.customer_id, "—"),
                "number": i.number,
                "due_date": i.due_date.isoformat() if i.due_date else "",
                "days_overdue": days_overdue,
                "balance_due": round(balance, 2),
            }
        )
    rows.sort(key=lambda r: (-r["days_overdue"], r["customer"]))
    if export == "csv":
        return rows_to_csv_response("outstanding.csv", ["customer", "number", "due_date", "days_overdue", "balance_due"], rows)
    return rows


# --- 5. Customer statement ---


@router.get("/customer-statement")
def customer_statement(
    customer_id: int,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    customer = db.get(Customer, customer_id)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.business_id == business_id, Invoice.customer_id == customer_id, Invoice.status != InvoiceStatus.void)
        .order_by(Invoice.invoice_date)
        .all()
    )
    rows = [
        {
            "number": i.number,
            "date": i.invoice_date.isoformat(),
            "billed": float(i.grand_total),
            "paid": float(i.amount_paid),
            "outstanding": round(float(i.grand_total) - float(i.amount_paid), 2),
        }
        for i in invoices
    ]
    if export == "csv":
        return rows_to_csv_response(f"statement_{customer_id}.csv", ["number", "date", "billed", "paid", "outstanding"], rows)
    return {
        "customer_id": customer_id,
        "customer_name": customer.name if customer else "—",
        "billed_total": round(sum(r["billed"] for r in rows), 2),
        "paid_total": round(sum(r["paid"] for r in rows), 2),
        "outstanding_total": round(sum(r["outstanding"] for r in rows), 2),
        "rows": rows,
    }


# --- 6. Service performance ---


@router.get("/service-performance")
def service_performance_report(
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    items = (
        db.query(InvoiceItem)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .filter(Invoice.business_id == business_id, Invoice.invoice_date >= d_from, Invoice.invoice_date <= d_to, Invoice.status != InvoiceStatus.void)
        .all()
    )
    agg: dict[str, dict] = {}
    for it in items:
        entry = agg.setdefault(it.description, {"service": it.description, "count": 0, "revenue": 0.0})
        entry["count"] += 1
        entry["revenue"] += float(it.line_total)
    rows = sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)
    for r in rows:
        r["revenue"] = round(r["revenue"], 2)
    if export == "csv":
        return rows_to_csv_response("service_performance.csv", ["service", "count", "revenue"], rows)
    return rows


# --- 7. Quotations report ---


@router.get("/quotations")
def quotations_report(
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    quotations = (
        db.query(Quotation)
        .filter(Quotation.business_id == business_id, Quotation.quotation_date >= d_from, Quotation.quotation_date <= d_to)
        .all()
    )
    customers = _customer_map(db, business_id)
    rows = [
        {
            "number": q.number,
            "date": q.quotation_date.isoformat(),
            "customer": customers.get(q.customer_id, "—"),
            "status": q.status.value,
            "total": float(q.grand_total),
        }
        for q in sorted(quotations, key=lambda x: x.quotation_date, reverse=True)
    ]
    if export == "csv":
        return rows_to_csv_response("quotations.csv", ["number", "date", "customer", "status", "total"], rows)
    counts = {"created": len(quotations), "accepted": 0, "converted": 0, "pending": 0, "rejected": 0}
    for q in quotations:
        if q.status.value in counts:
            counts[q.status.value] += 1
        if q.status.value in ("draft", "sent"):
            counts["pending"] += 1
    return {"counts": counts, "rows": rows}


# --- 8. Attendance summary ---


@router.get("/attendance-summary")
def attendance_summary_report(
    date_from: date | None = None,
    date_to: date | None = None,
    export: str | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Any:
    d_from, d_to = _period(date_from, date_to)
    employees = (
        db.query(Employee)
        .filter(Employee.business_id == business_id, Employee.is_active.is_(True))
        .order_by(Employee.name)
        .all()
    )
    records = (
        db.query(Attendance)
        .filter(Attendance.business_id == business_id, Attendance.date >= d_from, Attendance.date <= d_to)
        .all()
    )
    counts = {e.id: {"present": 0, "absent": 0, "leave": 0} for e in employees}
    for r in records:
        if r.employee_id in counts:
            counts[r.employee_id][r.status.value] += 1
    rows = [
        {
            "employee": e.name,
            "present": counts[e.id]["present"],
            "absent": counts[e.id]["absent"],
            "leave": counts[e.id]["leave"],
        }
        for e in employees
    ]
    if export == "csv":
        return rows_to_csv_response("attendance_summary.csv", ["employee", "present", "absent", "leave"], rows)
    return rows
