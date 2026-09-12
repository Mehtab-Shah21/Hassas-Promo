from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models.expense import Expense, ExpenseType

# All money math here stays in Decimal end to end: amount is a Numeric(12,2)
# column, which SQLAlchemy hydrates as Decimal by default (asdecimal=True),
# and func.sum over a Numeric column likewise returns a Decimal from the DB
# — so as long as nothing here calls float(...), no float rounding error
# can creep into a number the client makes business decisions on. This is
# intentionally separate from services/invoice_calc.py, which is existing
# invoice logic left untouched and still computes in float.
#
# Reused by both this module's own /api/expenses/summary and (Step 3) the
# Dashboard's net-revenue calculation, so the figure is never computed two
# different ways.


def build_expense_query(
    db: Session,
    business_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    type_: ExpenseType | None = None,
) -> Query:
    q = db.query(Expense).filter(Expense.business_id == business_id)
    if date_from:
        q = q.filter(Expense.date >= date_from)
    if date_to:
        q = q.filter(Expense.date <= date_to)
    if type_:
        q = q.filter(Expense.type == type_)
    return q


def total_expenses(
    db: Session,
    business_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    type_: ExpenseType | None = None,
) -> Decimal:
    q = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(Expense.business_id == business_id)
    if date_from:
        q = q.filter(Expense.date >= date_from)
    if date_to:
        q = q.filter(Expense.date <= date_to)
    if type_:
        q = q.filter(Expense.type == type_)
    result = q.scalar()
    return result if isinstance(result, Decimal) else Decimal(str(result or 0))


def expenses_by_type(
    db: Session,
    business_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Decimal]:
    return {t.value: total_expenses(db, business_id, date_from, date_to, type_=t) for t in ExpenseType}
