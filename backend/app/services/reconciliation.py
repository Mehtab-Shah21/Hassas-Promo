from datetime import date

from sqlalchemy.orm import Query, Session

from app.models.invoice import ClearedStatus, Invoice, Payment, PaymentMethod

# Single source of truth for "which payments count toward reconciliation" and
# "how collected/pending totals are summed from them" — shared by the
# Reconciliation page's own endpoint and the Dashboard's reconciliation KPI
# cards, so the two never drift apart.


def build_reconciliation_query(
    db: Session,
    business_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Query:
    q = (
        db.query(Payment)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(
            Invoice.business_id == business_id,
            Payment.payment_method.in_([PaymentMethod.card, PaymentMethod.online]),
        )
    )
    if date_from:
        q = q.filter(Payment.paid_on >= date_from)
    if date_to:
        q = q.filter(Payment.paid_on <= date_to)
    return q


def totals_from_payments(payments: list[Payment]) -> tuple[float, float]:
    """Returns (total_collected, total_pending) — collected = already
    cleared/received, pending = not yet cleared."""
    total_collected = round(sum(float(p.amount) for p in payments if p.cleared_status == ClearedStatus.received), 2)
    total_pending = round(sum(float(p.amount) for p in payments if p.cleared_status == ClearedStatus.pending), 2)
    return total_collected, total_pending
