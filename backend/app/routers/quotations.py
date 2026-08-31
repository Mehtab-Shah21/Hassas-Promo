from datetime import date, timedelta

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
from app.models.quotation import Quotation, QuotationItem, QuotationStatus
from app.models.service import Service
from app.schemas.quotation import (
    PaginatedQuotations,
    QuotationCreate,
    QuotationListItem,
    QuotationResponse,
    QuotationStatusUpdate,
)
from app.services.audit import write_audit_log
from app.services.invoice_calc import calc_invoice_totals, calc_line
from app.services.numbering import reserve_invoice_number, reserve_quotation_number
from app.services.pdf import (
    PdfEngineUnavailable,
    render_pdf,
    render_quotation_html,
    render_quotation_thermal_html,
)

router = APIRouter(prefix="/api/quotations", tags=["quotations"])


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


def _build_lines(db: Session, business: Business, items, current_user):
    """Shared with invoices: resolve service/ad-hoc lines into calculated rows."""
    line_calcs = []
    line_discounts = []
    resolved = []  # (service_id | None, description, unit_price, govt_fee, vat_rate)

    for item in items:
        service: Service | None = None
        if item.service_id is not None:
            service = db.get(Service, item.service_id)
            if not service or service.business_id != business.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service not found")

        description = item.description or (service.name if service else None)
        unit_price = item.unit_price if item.unit_price is not None else (float(service.price) if service else None)
        govt_fee = item.govt_fee if item.govt_fee is not None else (float(service.govt_fee) if service else 0)
        taxable = service.taxable if service else True
        vat_rate = item.vat_rate if item.vat_rate is not None else (float(business.default_vat_rate) if taxable else 0)

        if description is None or unit_price is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Line item is missing description/price")

        if service is None and item.save_as_service:
            if current_user.role != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only an admin can save an ad-hoc line as a reusable service",
                )
            service = Service(
                business_id=business.id,
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
        resolved.append((service.id if service else None, description, item.qty, unit_price, govt_fee, item.discount, vat_rate, calc.line_total))

    return line_calcs, line_discounts, resolved


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    business = db.get(Business, business_id)
    customer = db.get(Customer, payload.customer_id)
    if not customer or customer.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    if payload.employee_customer_id is not None:
        emp = db.get(Customer, payload.employee_customer_id)
        if not emp or emp.business_id != business_id or emp.parent_customer_id != customer.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid employee_customer_id")

    coupon = _resolve_coupon(db, business_id, payload.coupon_code)
    line_calcs, line_discounts, resolved = _build_lines(db, business, payload.items, current_user)
    totals = calc_invoice_totals(line_calcs, line_discounts, coupon)

    validity_days = payload.validity_days or business.default_quotation_validity_days
    valid_until = payload.quotation_date + timedelta(days=validity_days)
    number = reserve_quotation_number(db, business)

    quotation = Quotation(
        business_id=business_id,
        number=number,
        customer_id=customer.id,
        employee_customer_id=payload.employee_customer_id,
        quotation_date=payload.quotation_date,
        validity_days=validity_days,
        valid_until=valid_until,
        status=QuotationStatus.draft,
        subtotal=totals.subtotal,
        discount_total=totals.discount_total,
        coupon_id=coupon.id if coupon else None,
        vat_total=totals.vat_total,
        govt_fee_total=totals.govt_fee_total,
        grand_total=totals.grand_total,
        notes=payload.notes,
        terms=payload.terms,
        show_bank_details=payload.show_bank_details,
        created_by=current_user.id,
        items=[
            QuotationItem(
                service_id=service_id,
                description=description,
                qty=qty,
                unit_price=unit_price,
                govt_fee=govt_fee,
                discount=discount,
                vat_rate=vat_rate,
                line_total=line_total,
            )
            for service_id, description, qty, unit_price, govt_fee, discount, vat_rate, line_total in resolved
        ],
    )
    db.add(quotation)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="quotation", entity_id=quotation.id, description=f"Created quotation {quotation.number} ({quotation.grand_total})",
    )
    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("", response_model=PaginatedQuotations)
def list_quotations(
    business_id: int = Depends(require_active_business_id),
    search: str | None = Query(default=None),
    status_filter: QuotationStatus | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.business_id == business_id)
    if search:
        like = f"%{search}%"
        q = q.join(Customer, Quotation.customer_id == Customer.id).filter(
            or_(Quotation.number.ilike(like), Customer.name.ilike(like))
        )
    if status_filter:
        q = q.filter(Quotation.status == status_filter)
    if date_from:
        q = q.filter(Quotation.quotation_date >= date_from)
    if date_to:
        q = q.filter(Quotation.quotation_date <= date_to)

    total = q.count()
    items = q.order_by(Quotation.quotation_date.desc(), Quotation.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedQuotations(items=items, total=total, page=page, page_size=page_size)


@router.get("/{quotation_id}", response_model=QuotationResponse)
def get_quotation(
    quotation_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    quotation = (
        db.query(Quotation).options(selectinload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    )
    if not quotation or quotation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return quotation


@router.patch("/{quotation_id}/status", response_model=QuotationResponse)
def update_status(
    quotation_id: int,
    payload: QuotationStatusUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    quotation = db.get(Quotation, quotation_id)
    if not quotation or quotation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status == QuotationStatus.converted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already converted to an invoice")
    quotation.status = payload.status
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="quotation", entity_id=quotation.id, description=f"Set quotation {quotation.number} status to {payload.status.value}",
    )
    db.commit()
    db.refresh(quotation)
    return quotation


@router.post("/{quotation_id}/convert", status_code=status.HTTP_201_CREATED)
def convert_to_invoice(
    quotation_id: int,
    payment_method: PaymentMethod = Query(default=PaymentMethod.cash),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    quotation = (
        db.query(Quotation).options(selectinload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    )
    if not quotation or quotation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status == QuotationStatus.converted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already converted")

    business = db.get(Business, business_id)
    is_cash = payment_method == PaymentMethod.cash
    number = reserve_invoice_number(db, business)
    today = date.today()

    invoice = Invoice(
        business_id=business_id,
        number=number,
        customer_id=quotation.customer_id,
        employee_customer_id=quotation.employee_customer_id,
        payment_method=payment_method,
        invoice_date=today,
        due_date=None,
        status=InvoiceStatus.paid,
        subtotal=quotation.subtotal,
        discount_total=quotation.discount_total,
        coupon_id=quotation.coupon_id,
        vat_total=quotation.vat_total,
        govt_fee_total=quotation.govt_fee_total,
        grand_total=quotation.grand_total,
        amount_paid=quotation.grand_total,
        notes=quotation.notes,
        terms=quotation.terms,
        show_bank_details=quotation.show_bank_details,
        created_by=current_user.id,
        items=[
            InvoiceItem(
                service_id=qi.service_id,
                description=qi.description,
                qty=qi.qty,
                unit_price=qi.unit_price,
                govt_fee=qi.govt_fee,
                discount=qi.discount,
                vat_rate=qi.vat_rate,
                line_total=qi.line_total,
            )
            for qi in quotation.items
        ],
    )
    db.add(invoice)
    db.flush()

    db.add(
        Payment(
            invoice_id=invoice.id,
            amount=quotation.grand_total,
            method=payment_method.value,
            paid_on=today,
            reference=None,
            payment_method=payment_method,
            cleared_status=ClearedStatus.received if is_cash else ClearedStatus.pending,
            received_at=today if is_cash else None,
        )
    )

    quotation.status = QuotationStatus.converted
    quotation.converted_invoice_id = invoice.id

    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="convert",
        entity_type="quotation", entity_id=quotation.id,
        description=f"Converted quotation {quotation.number} to invoice {invoice.number}",
    )
    db.commit()
    db.refresh(invoice)
    return {"invoice_id": invoice.id, "invoice_number": invoice.number}


def _render_html_for_quotation(db: Session, quotation_id: int, business_id: int) -> str:
    quotation = (
        db.query(Quotation).options(selectinload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    )
    if not quotation or quotation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    business = db.get(Business, business_id)
    customer = db.get(Customer, quotation.customer_id)
    employee = db.get(Customer, quotation.employee_customer_id) if quotation.employee_customer_id else None
    coupon = db.get(Coupon, quotation.coupon_id) if quotation.coupon_id else None

    return render_quotation_html(
        quotation=quotation, business=business, customer=customer, employee=employee, coupon_code=coupon.code if coupon else None
    )


@router.get("/{quotation_id}/preview", response_class=HTMLResponse)
def preview_quotation(
    quotation_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return HTMLResponse(_render_html_for_quotation(db, quotation_id, business_id))


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    html = _render_html_for_quotation(db, quotation_id, business_id)
    try:
        pdf_bytes = render_pdf(html)
    except PdfEngineUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return Response(content=pdf_bytes, media_type="application/pdf")


def _render_thermal_html_for_quotation(db: Session, quotation_id: int, business_id: int, width: int | None) -> str:
    quotation = (
        db.query(Quotation).options(selectinload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    )
    if not quotation or quotation.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    business = db.get(Business, business_id)
    customer = db.get(Customer, quotation.customer_id)
    return render_quotation_thermal_html(quotation=quotation, business=business, customer=customer, width_override=width)


@router.get("/{quotation_id}/thermal-preview", response_class=HTMLResponse)
def preview_quotation_thermal(
    quotation_id: int,
    width: int | None = Query(default=None, description="Override the business's stored paper width: 58 or 80"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return HTMLResponse(_render_thermal_html_for_quotation(db, quotation_id, business_id, width))


@router.get("/{quotation_id}/thermal-pdf")
def download_quotation_thermal_pdf(
    quotation_id: int,
    width: int | None = Query(default=None, description="Override the business's stored paper width: 58 or 80"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    html = _render_thermal_html_for_quotation(db, quotation_id, business_id, width)
    try:
        pdf_bytes = render_pdf(html)
    except PdfEngineUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return Response(content=pdf_bytes, media_type="application/pdf")
