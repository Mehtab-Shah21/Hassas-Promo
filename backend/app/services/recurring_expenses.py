"""Turning fixed monthly costs into real expenses, on time, exactly once.

The whole point of the feature is that nobody has to remember the list, so
generation has to hold up against a PC that was switched off for a fortnight,
an app opened twice at once, and a definition added halfway through a year:

- **Idempotent.** One Expense per (definition, month), enforced by looking for
  an existing row with that recurring_expense_id in that month before writing.
  Running generation ten times in a row produces the same rows as running it
  once, so it's safe to call on every login and from the scheduler.
- **Catches up.** It walks every month from the definition's start_date up to
  the current month, not just "this month" -- if the PC was off for the whole
  of March, March is still created the moment the app next opens.
- **Never invents history.** Months before start_date are never generated, so
  adding "Rent" today doesn't fabricate rent for last year.
- **Follows the real calendar.** Start and end are actual dates. A cost
  starting on the 15th is charged for the 15th to the month's real last day
  (16 days of a 30-day month, 17 of a 31-day one, 14 of February), prorated
  by that month's own length -- never a flat 30 -- and from the next month it
  covers the 1st to the last day in full. An end date mid-month prorates the
  final month the same way.
- **Future months are deliberately NOT pre-created.** Editing an amount is
  supposed to apply to future months only; if next year's rows already
  existed, every edit would have to hunt them down and rewrite them. Growing
  the list one month at a time makes "past stays accurate, future picks up the
  change" the natural result rather than something to maintain.
- **Rolls into the next year by itself.** end_date is normally NULL, so there
  is no year boundary to fall off; nothing needs renewing in January.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.expense import Expense, ExpenseType
from app.models.recurring_expense import RecurringExpense

logger = logging.getLogger(__name__)

CENT = Decimal("0.01")


def month_start(value: date) -> date:
    return value.replace(day=1)


def add_months(value: date, months: int) -> date:
    """Shift a first-of-month date by whole months."""
    total = (value.year * 12 + value.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


def month_end(value: date) -> date:
    """The real last day of `value`'s month -- 28, 29, 30 or 31 by the calendar."""
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def days_in_month(value: date) -> int:
    return calendar.monthrange(value.year, value.month)[1]


def _date_in_month(month: date, day_of_month: int) -> date:
    """The definition's day, clamped to months that are too short for it --
    a "31st" salary lands on the 28th/29th in February rather than failing."""
    last_day = calendar.monthrange(month.year, month.month)[1]
    return month.replace(day=min(max(day_of_month, 1), last_day))


def months_between(start: date, end: date):
    """Every first-of-month from `start` through `end`, inclusive."""
    current = month_start(start)
    last = month_start(end)
    while current <= last:
        yield current
        current = add_months(current, 1)


def covered_period(start_date: date, end_date: date | None, month: date) -> tuple[date, date] | None:
    """The stretch of `month` a cost running from `start_date` to `end_date`
    (inclusive; None = no end) actually applies to, or None if it doesn't
    touch that month at all.

    A start on the 15th covers the 15th to the month's real last day; a
    following month covers the 1st to its last day; an end on the 20th covers
    the 1st to the 20th. Everything is real calendar dates, so a 30- and a
    31-day month (and February) each cover exactly their own length.
    """
    first, last = month_start(month), month_end(month)
    start = max(first, start_date)
    end = min(last, end_date) if end_date is not None else last
    return (start, end) if start <= end else None


def prorated_amount(monthly_amount, month: date, start: date, end: date) -> Decimal:
    """What `monthly_amount` comes to for the days from `start` to `end`
    within `month`: the full amount for a whole month, otherwise
    amount x (days covered / days in THAT month), to the cent.

    Dividing by the month's real length -- not a flat 30 -- is the point:
    16 days of a 30-day month is 16/30, 17 days of a 31-day month is 17/31,
    and 14 days of a 28-day February is 14/28.
    """
    amount = Decimal(str(monthly_amount))
    covered = (end - start).days + 1
    total_days = days_in_month(month)
    if covered >= total_days:
        return amount.quantize(CENT, rounding=ROUND_HALF_UP)
    return (amount * covered / total_days).quantize(CENT, rounding=ROUND_HALF_UP)


def _entry_description(label: str, month: date, start: date, end: date) -> str:
    """The label, plus a short note when only part of the month is charged so
    it's obvious why an entry is less than the full monthly amount."""
    covered = (end - start).days + 1
    total_days = days_in_month(month)
    if covered >= total_days:
        return label
    return f"{label} ({covered}/{total_days} days)"


def entry_for_month(definition: RecurringExpense, month: date) -> tuple[date, Decimal, str] | None:
    """(date, amount, description) the expense for `month` should have, or
    None if the definition doesn't cover that month."""
    period = covered_period(definition.start_date, definition.end_date, month)
    if period is None:
        return None
    start, end = period
    # Dated on the payment day if it falls inside what's covered, otherwise
    # the nearest covered day -- so the entry always sits within the period it
    # pays for (and therefore inside its own month).
    entry_date = min(max(_date_in_month(month, definition.day_of_month), start), end)
    return (
        entry_date,
        prorated_amount(definition.amount, month, start, end),
        _entry_description(definition.label, month, start, end),
    )


def generate_for_definition(db: Session, definition: RecurringExpense, through: date | None = None) -> list[Expense]:
    """Create any missing Expense rows for `definition` up to `through`
    (default: today's month). Returns only the rows actually created."""
    if not definition.is_active:
        return []

    through_month = month_start(through or date.today())
    if definition.end_date is not None:
        through_month = min(through_month, month_start(definition.end_date))
    first_month = month_start(definition.start_date)
    if through_month < first_month:
        return []

    existing_months = {
        month_start(row_date)
        for (row_date,) in db.query(Expense.date)
        .filter(Expense.recurring_expense_id == definition.id)
        .all()
    }

    created: list[Expense] = []
    for month in months_between(first_month, through_month):
        if month in existing_months:
            continue
        entry = entry_for_month(definition, month)
        if entry is None:
            continue
        entry_date, amount, description = entry
        expense = Expense(
            business_id=definition.business_id,
            type=definition.type,
            amount=amount,
            description=description,
            date=entry_date,
            employee_id=definition.employee_id,
            created_by=definition.created_by,
            recurring_expense_id=definition.id,
            # Scheduled, not yet settled -- this is what makes the "still
            # pending" figures on the dashboard and the employee's salary
            # status mean something.
            is_paid=False,
        )
        db.add(expense)
        created.append(expense)
    return created


def reconcile_after_end_date_change(
    db: Session, definition: RecurringExpense, old_end_date: date | None, rate=None
) -> tuple[int, int]:
    """Bring already-generated months in line after the END DATE moved.

    Generation only ever adds missing months, so without this an end date set
    to the 20th of a month that has already been generated would leave that
    month charged in full, and one moved earlier would leave whole months
    that should no longer exist.

    Deliberately conservative: only entries that are still exactly what the
    OLD schedule produced -- unpaid, no receipt attached, amount unedited --
    are touched. Anything already paid, documented, or adjusted by hand is a
    real record and is left alone. Returns (adjusted, removed).

    `rate` is the monthly amount that was in force when those entries were
    generated. It matters when the amount is edited in the same save as the
    end date: a raise applies to FUTURE months only, so the month being
    re-prorated keeps the old rate -- only its number of days changes.
    """
    rate = definition.amount if rate is None else rate
    adjusted = removed = 0
    rows = db.query(Expense).filter(Expense.recurring_expense_id == definition.id).all()
    for row in rows:
        if row.is_paid or row.attachment_path:
            continue
        month = month_start(row.date)
        old_period = covered_period(definition.start_date, old_end_date, month)
        if old_period is None:
            continue
        if Decimal(str(row.amount)) != prorated_amount(rate, month, *old_period):
            continue  # edited by hand since it was generated

        new_period = covered_period(definition.start_date, definition.end_date, month)
        if new_period is None:
            db.delete(row)
            removed += 1
            continue
        new_amount = prorated_amount(rate, month, *new_period)
        new_description = _entry_description(definition.label, month, *new_period)
        if new_amount != Decimal(str(row.amount)) or new_description != row.description:
            row.amount = new_amount
            row.description = new_description
            adjusted += 1
    return adjusted, removed


def generate_due_expenses(db: Session, business_id: int | None = None, through: date | None = None) -> int:
    """Bring every active definition up to date. Returns how many rows were
    created. Commits, because callers are usually "on the way to doing
    something else" (a login, the scheduler tick) rather than in a
    transaction of their own."""
    q = db.query(RecurringExpense).filter(RecurringExpense.is_active.is_(True))
    if business_id is not None:
        q = q.filter(RecurringExpense.business_id == business_id)

    created_count = 0
    for definition in q.all():
        created_count += len(generate_for_definition(db, definition, through))
    if created_count:
        db.commit()
        logger.info("generated %s recurring expense rows", created_count)
    return created_count


def monthly_commitment(db: Session, business_id: int) -> float:
    """What this business is committed to paying every month right now --
    the sum of every active definition's FULL monthly amount that is in force
    this month, whether or not this month's rows have been generated yet.
    (Proration only shrinks an individual month's entry; the standing
    commitment is the rate.)"""
    today = date.today()
    first, last = month_start(today), month_end(today)
    total = 0.0
    for definition in (
        db.query(RecurringExpense)
        .filter(RecurringExpense.business_id == business_id, RecurringExpense.is_active.is_(True))
        .all()
    ):
        if definition.start_date > last:
            continue
        if definition.end_date is not None and definition.end_date < first:
            continue
        total += float(definition.amount)
    return round(total, 2)


def month_status(db: Session, business_id: int, when: date | None = None) -> dict:
    """This month's fixed costs split into paid vs still pending, for the
    dashboard card. Counts only generated (recurring) rows -- one-off company
    expenses are not a standing commitment."""
    when = when or date.today()
    rows = (
        db.query(Expense)
        .filter(
            Expense.business_id == business_id,
            Expense.recurring_expense_id.isnot(None),
            extract("year", Expense.date) == when.year,
            extract("month", Expense.date) == when.month,
        )
        .all()
    )
    paid = sum(float(r.amount) for r in rows if r.is_paid)
    pending = sum(float(r.amount) for r in rows if not r.is_paid)
    return {
        "generated_total": round(paid + pending, 2),
        "paid": round(paid, 2),
        "pending": round(pending, 2),
        "entry_count": len(rows),
    }


def salary_status_for_employee(db: Session, employee_id: int, business_id: int) -> dict:
    """Every salary expense recorded for one employee, split paid vs pending
    -- what the employee detail view shows."""
    rows = (
        db.query(Expense)
        .filter(
            Expense.business_id == business_id,
            Expense.employee_id == employee_id,
            Expense.type == ExpenseType.salary,
        )
        .order_by(Expense.date.desc())
        .all()
    )
    return {
        "total_paid": round(sum(float(r.amount) for r in rows if r.is_paid), 2),
        "total_pending": round(sum(float(r.amount) for r in rows if not r.is_paid), 2),
        "entries": rows,
    }
