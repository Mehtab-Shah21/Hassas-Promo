from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id
from app.models.business import Business
from app.models.coupon import Coupon
from app.models.customer import Customer
from app.models.invoice import ClearedStatus, Invoice, InvoiceItem, InvoiceStatus, Payment, PaymentMethod
from app.models.service import Service
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceKpis,
    InvoiceListItem,
    InvoiceResponse,
    InvoiceStatusUpdate,
    PaginatedInvoices,
    PaymentCreate,
    PaymentResponse,
)
from app.services.audit import write_audit_log
from app.services.invoice_calc import calc_invoice_totals, calc_line
from app.services.numbering import reserve_invoice_number
from app.services.pdf import (
    PdfEngineUnavailable,
    render_invoice_html,
    render_invoice_thermal_html,
    render_pdf,
)

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

OPEN_STATUSES = (InvoiceStatus.draft, InvoiceStatus.sent, InvoiceStatus.partial)


def _is_effectively_overdue(inv: Invoice) -> bool:
    return inv.status in (InvoiceStatus.sent, InvoiceStatus.partial) and bool(
        inv.due_date and inv.due_date < date.today()
    )


def _resolve_coupon(db: Session, business_id: int, code: str | None) -> Coupon | None:
    if not code:
        return None
    coupon = db.query(Coupon).filter(Coupon.business_id == business_id, Coupon.code == code).first()
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon is not valid")
    today = date.today()
    if coupon.valid_from and coupon.valid_from > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon is not active yet")
    if coupon.valid_to and coupon.valid_to < today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon has expired")
    return coupon


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    customer = db.get(Customer, payload.customer_id)
    if not customer or customer.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

    if payload.employee_customer_id is not None:
        emp = db.get(Customer, payload.employee_customer_id)
        if not emp or emp.business_id != business_id or emp.parent_customer_id != customer.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="employee_customer_id must be an employee of the selected company customer",
            )

    coupon = _resolve_coupon(db, business_id, payload.coupon_code)

    line_calcs = []
    line_discounts = []
    item_rows: list[InvoiceItem] = []

    for item in payload.items:
        service: Service | None = None
        if item.service_id is not None:
            service = db.get(Service, item.service_id)
            if not service or service.business_id != business_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service not found")

        description = item.description or (service.name if service else None)
        unit_price = item.unit_price if item.unit_price is not None else (float(service.price) if service else None)
        govt_fee = item.govt_fee if item.govt_fee is not None else (float(service.govt_fee) if service else 0)
        taxable = service.taxable if service else True
        vat_rate = item.vat_rate if item.vat_rate is not None else (float(business.default_vat_rate) if taxable else 0)

        if description is None or unit_price is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Line item is missing description/price")

        # Ad-hoc "save to services for later use" — restricted to admins since
        # CLAUDE.md's permission matrix marks Services as admin-managed /
        # employee-read-only, even though the invoice line itself is fully
        # editable by employees.
        if service is None and item.save_as_service:
            if current_user.role != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only an admin can save an ad-hoc line as a reusable service",
                )
            service = Service(
                business_id=business_id,
                name=description,
                price=unit_price,
                govt_fee=govt_fee,
                category_id=item.category_id,
                taxable=taxable,
            )
            db.add(service)
            db.flush()

        calc = calc_line(item.qty, unit_price, item.discount, vat_rate, govt_fee)
        line_calcs.append(calc)
        line_discounts.append(item.discount)
        item_rows.append(
            InvoiceItem(
                service_id=service.id if service else None,
                description=description,
                qty=item.qty,
                unit_price=unit_price,
                govt_fee=govt_fee,
                discount=item.discount,
                vat_rate=vat_rate,
                line_total=calc.line_total,
            )
        )

    totals = calc_invoice_totals(line_calcs, line_discounts, coupon)

    # Every invoice created through this flow is paid immediately — the
    # invoice records how it was paid (payment_method), not whether it's
    # still owed. Cash clears on the spot; card/online start pending until
    # reconciled in the Reconciliation view.
    is_cash = payload.payment_method == PaymentMethod.cash
    number = reserve_invoice_number(db, business)

    invoice = Invoice(
        business_id=business_id,
        number=number,
        customer_id=customer.id,
        employee_customer_id=payload.employee_customer_id,
        payment_method=payload.payment_method,
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        status=InvoiceStatus.paid,
        subtotal=totals.subtotal,
        discount_total=totals.discount_total,
        coupon_id=coupon.id if coupon else None,
        vat_total=totals.vat_total,
        govt_fee_total=totals.govt_fee_total,
        grand_total=totals.grand_total,
        amount_paid=totals.grand_total,
        notes=payload.notes,
        terms=payload.terms,
        show_bank_details=payload.show_bank_details,
        created_by=current_user.id,
        items=item_rows,
    )
    db.add(invoice)
    db.flush()

    db.add(
        Payment(
            invoice_id=invoice.id,
            amount=totals.grand_total,
            method=payload.payment_method.value,
            paid_on=payload.invoice_date,
            reference=None,
            payment_method=payload.payment_method,
            cleared_status=ClearedStatus.received if is_cash else ClearedStatus.pending,
            received_at=payload.invoice_date if is_cash else None,
        )
    )

    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="invoice", entity_id=invoice.id, description=f"Created invoice {invoice.number} ({invoice.grand_total})",
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("", response_model=PaginatedInvoices)
def list_invoices(
    business_id: int = Depends(require_active_business_id),
    search: str | None = Query(default=None),
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    overdue_only: bool = Query(default=False),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Invoice).filter(Invoice.business_id == business_id)
    if search:
        like = f"%{search}%"
        q = q.join(Customer, Invoice.customer_id == Customer.id).filter(
            or_(Invoice.number.ilike(like), Customer.name.ilike(like))
        )
    if status_filter:
        q = q.filter(Invoice.status == status_filter)
    if overdue_only:
        q = q.filter(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < date.today())
    if date_from:
        q = q.filter(Invoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(Invoice.invoice_date <= date_to)

    total = q.count()
    items = q.order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedInvoices(items=items, total=total, page=page, page_size=page_size)


@router.get("/kpis", response_model=InvoiceKpis)
def invoice_kpis(
    business_id: int = Depends(require_active_business_id),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Invoice).filter(Invoice.business_id == business_id)
    if date_from:
        q = q.filter(Invoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(Invoice.invoice_date <= date_to)
    all_invoices = q.all()

    def bucket(predicate):
        matched = [i for i in all_invoices if predicate(i)]
        return len(matched), round(sum(float(i.grand_total) for i in matched), 2)

    total_count, total_amount = bucket(lambda i: True)
    paid_count, paid_amount = bucket(lambda i: i.status == InvoiceStatus.paid)
    void_count, void_amount = bucket(lambda i: i.status == InvoiceStatus.void)
    overdue_count, overdue_amount = bucket(_is_effectively_overdue)
    pending_count, pending_amount = bucket(
        lambda i: i.status in OPEN_STATUSES and not _is_effectively_overdue(i)
    )

    return InvoiceKpis(
        total_count=total_count,
        total_amount=total_amount,
        pending_count=pending_count,
        pending_amount=pending_amount,
        paid_count=paid_count,
        paid_amount=paid_amount,
        overdue_count=overdue_count,
        overdue_amount=overdue_amount,
        void_count=void_count,
        void_amount=void_amount,
    )


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice or invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
def update_status(
    invoice_id: int,
    payload: InvoiceStatusUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    invoice.status = payload.status
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="invoice", entity_id=invoice.id, description=f"Set invoice {invoice.number} status to {payload.status.value}",
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def record_payment(
    invoice_id: int,
    payload: PaymentCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if invoice.status == InvoiceStatus.void:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot record payment on a void invoice")

    is_cash = payload.payment_method == PaymentMethod.cash
    payment = Payment(
        invoice_id=invoice.id,
        **payload.model_dump(),
        cleared_status=ClearedStatus.received if is_cash else ClearedStatus.pending,
        received_at=payload.paid_on if is_cash else None,
    )
    db.add(payment)

    invoice.amount_paid = float(invoice.amount_paid) + payload.amount
    if invoice.amount_paid >= float(invoice.grand_total):
        invoice.status = InvoiceStatus.paid
    elif invoice.amount_paid > 0:
        invoice.status = InvoiceStatus.partial

    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="payment", entity_id=None, description=f"Recorded payment of {payload.amount} on invoice {invoice.number}",
    )
    db.commit()
    db.refresh(payment)
    return payment


def _render_html_for_invoice(db: Session, invoice_id: int, business_id: int) -> str:
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.items))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice or invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    business = db.get(Business, business_id)
    customer = db.get(Customer, invoice.customer_id)
    employee = db.get(Customer, invoice.employee_customer_id) if invoice.employee_customer_id else None
    coupon = db.get(Coupon, invoice.coupon_id) if invoice.coupon_id else None

    return render_invoice_html(
        invoice=invoice,
        business=business,
        customer=customer,
        employee=employee,
        coupon_code=coupon.code if coupon else None,
    )


@router.get("/{invoice_id}/preview", response_class=HTMLResponse)
def preview_invoice(
    invoice_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Same template as the PDF, rendered as plain HTML — works even if WeasyPrint's
    native libs aren't installed, so on-screen preview never depends on them."""
    return HTMLResponse(_render_html_for_invoice(db, invoice_id, business_id))


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    html = _render_html_for_invoice(db, invoice_id, business_id)
    try:
        pdf_bytes = render_pdf(html)
    except PdfEngineUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return Response(content=pdf_bytes, media_type="application/pdf")


def _render_thermal_html_for_invoice(db: Session, invoice_id: int, business_id: int, width: int | None) -> str:
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice or invoice.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    business = db.get(Business, business_id)
    customer = db.get(Customer, invoice.customer_id)
    return render_invoice_thermal_html(invoice=invoice, business=business, customer=customer, width_override=width)


@router.get("/{invoice_id}/thermal-preview", response_class=HTMLResponse)
def preview_invoice_thermal(
    invoice_id: int,
    width: int | None = Query(default=None, description="Override the business's stored paper width: 58 or 80"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return HTMLResponse(_render_thermal_html_for_invoice(db, invoice_id, business_id, width))


@router.get("/{invoice_id}/thermal-pdf")
def download_invoice_thermal_pdf(
    invoice_id: int,
    width: int | None = Query(default=None, description="Override the business's stored paper width: 58 or 80"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    html = _render_thermal_html_for_invoice(db, invoice_id, business_id, width)
    try:
        pdf_bytes = render_pdf(html)
    except PdfEngineUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return Response(content=pdf_bytes, media_type="application/pdf")
