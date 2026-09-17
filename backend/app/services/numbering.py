from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.business import Business


def reserve_invoice_number(db: Session, business: Business) -> str:
    """Atomically claim the next invoice number for this business.

    Uses a single UPDATE ... RETURNING statement so the read-increment is one
    atomic DB operation — safe under concurrent LAN writers. Caller must
    commit this in the SAME transaction as the invoice insert (don't call
    db.commit() between this and the insert) so a failed insert can't leave a
    gap-causing partial commit.
    """
    result = db.execute(
        update(Business)
        .where(Business.id == business.id)
        .values(next_invoice_no=Business.next_invoice_no + 1)
        .returning(Business.next_invoice_no, Business.invoice_prefix)
    )
    new_counter, prefix = result.one()
    claimed = new_counter - 1
    return f"{prefix}{claimed:05d}"


def auto_reference_numbers(document_number: str, line_index: int) -> tuple[str, str]:
    """(trans_no, inv_no) for a HASSAS line whose references are auto-filled.

    Inv No. is the document's own receipt number, as HASSAS asked. Trans No.
    has no outside source to copy, so it is derived from that same number plus
    the line's position: unique within the business (document numbers are),
    stable on re-print, and traceable back to the receipt it belongs to.
    """
    return f"{document_number}-T{line_index:02d}", document_number


def reserve_quotation_number(db: Session, business: Business) -> str:
    result = db.execute(
        update(Business)
        .where(Business.id == business.id)
        .values(next_quotation_no=Business.next_quotation_no + 1)
        .returning(Business.next_quotation_no, Business.quotation_prefix)
    )
    new_counter, prefix = result.one()
    claimed = new_counter - 1
    return f"{prefix}{claimed:05d}"
