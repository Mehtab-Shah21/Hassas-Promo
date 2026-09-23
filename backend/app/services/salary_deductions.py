"""Absence deductions from salary.

The rules, as the client set them:

- Only **Absent** (a whole day) and **Half day** (half a day) cost pay.
  Leave, lateness and leaving early cost nothing.
- A day's pay is the salary for the period divided by the number of days in
  it -- i.e. monthly pay / that month's real length (28, 29, 30 or 31). For a
  part first or last month the salary is already prorated, so dividing it by
  the days it covers gives the very same daily rate.
- An admin or superadmin has to **confirm** the deduction (or waive it).
  Nothing is taken off automatically, and the salary can't be marked paid
  while a deduction is waiting for that decision.
- On the salary's pay date, admins are alerted (see `pending_alerts`).

Until it is decided, a deduction is only ever *computed* from attendance -- no
row is stored -- so fixing a wrongly marked day simply changes the estimate.
Confirming freezes the figures in a `SalaryDeduction` row and reduces the
salary Expense by exactly that amount.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.expense import Expense, ExpenseType
from app.models.recurring_expense import RecurringExpense
from app.models.salary_deduction import DeductionDecision, SalaryDeduction
from app.services.recurring_expenses import (
    CENT,
    _date_in_month,
    covered_period,
    month_end,
    month_start,
)

HALF = Decimal("0.5")
# How far back a "salary due" alert keeps showing. Long enough that a weekend
# or a holiday doesn't lose it, short enough that months of old, forgotten
# unpaid rows (e.g. history caught up from a start date in the past) don't
# flood the bell forever.
ALERT_WINDOW_DAYS = 30


class DeductionError(Exception):
    """A rule was broken; the message is safe to show the user."""


def is_deductible(expense: Expense) -> bool:
    return expense.type == ExpenseType.salary and expense.employee_id is not None


def _definition(db: Session, expense: Expense) -> RecurringExpense | None:
    return db.get(RecurringExpense, expense.recurring_expense_id) if expense.recurring_expense_id else None


def salary_period(db: Session, expense: Expense) -> tuple[date, date]:
    """The stretch of the calendar this salary pays for. A generated salary
    knows exactly (a part-month for a mid-month start or end); a one-off
    salary is taken to be the whole calendar month it is dated in."""
    month = month_start(expense.date)
    definition = _definition(db, expense)
    if definition is not None:
        period = covered_period(definition.start_date, definition.end_date, month)
        if period is not None:
            return period
    return month, month_end(month)


def pay_date(db: Session, expense: Expense) -> date:
    """When this salary is paid. From the definition's pay day (NULL = the last
    day of the month); a one-off salary is paid on the date it is dated."""
    definition = _definition(db, expense)
    if definition is None:
        return expense.date
    month = month_start(expense.date)
    if definition.pay_day is None:
        return month_end(month)
    return _date_in_month(month, definition.pay_day)


def decision_for(db: Session, expense_id: int) -> SalaryDeduction | None:
    return db.query(SalaryDeduction).filter(SalaryDeduction.expense_id == expense_id).first()


def compute(db: Session, expense: Expense) -> dict:
    """The deduction this salary payment currently works out to, from attendance.

    Returns plain numbers (Decimal) plus the period, so callers can show the
    working. Never writes anything.
    """
    start, end = salary_period(db, expense)
    covered_days = (end - start).days + 1
    gross = Decimal(str(expense.amount))

    records = (
        db.query(Attendance.status)
        .filter(
            Attendance.employee_id == expense.employee_id,
            Attendance.date >= start,
            Attendance.date <= end,
            Attendance.status.in_([AttendanceStatus.absent, AttendanceStatus.half_day]),
        )
        .all()
    )
    absent = sum(1 for (s,) in records if s == AttendanceStatus.absent)
    half = sum(1 for (s,) in records if s == AttendanceStatus.half_day)
    days = Decimal(absent) + HALF * half

    daily_rate = gross / covered_days if covered_days else Decimal(0)
    amount = (daily_rate * days).quantize(CENT, rounding=ROUND_HALF_UP)
    amount = min(amount, gross.quantize(CENT))  # never more than the pay itself
    return {
        "period_start": start,
        "period_end": end,
        "covered_days": covered_days,
        "absent_days": absent,
        "half_days": half,
        "deduction_days": days,
        "daily_rate": daily_rate.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        "gross_amount": gross.quantize(CENT),
        "amount": amount,
    }


def summarize(db: Session, expense: Expense) -> dict:
    """Everything the UI needs about one salary's deduction, in one dict.

    status:
      none       nothing to deduct (no absences), or the salary was settled
                 before any deduction was decided
      pending    absences found, waiting for an admin to confirm or waive
      confirmed  deducted from the salary
      waived     an admin decided not to deduct
    """
    decision = decision_for(db, expense.id)
    pay = pay_date(db, expense)
    today = date.today()

    if decision is not None:
        return {
            "status": decision.decision.value,
            "period_start": decision.period_start,
            "period_end": decision.period_end,
            "covered_days": (decision.period_end - decision.period_start).days + 1,
            "absent_days": decision.absent_days,
            "half_days": decision.half_days,
            "deduction_days": Decimal(str(decision.deduction_days)),
            "daily_rate": Decimal(str(decision.daily_rate)),
            "gross_amount": Decimal(str(decision.gross_amount)),
            "amount": Decimal(str(decision.amount)),
            "net_amount": Decimal(str(expense.amount)),
            "pay_date": pay,
            "can_decide": False,
            "decided_at": decision.decided_at,
            "decided_by": decision.decided_by,
        }

    figures = compute(db, expense)
    if figures["deduction_days"] == 0 or expense.is_paid:
        status = "none"
        if expense.is_paid:
            # Paid before anything was decided: nothing more can be taken off.
            figures["amount"] = Decimal("0.00")
    else:
        status = "pending"
    return {
        "status": status,
        **figures,
        "net_amount": Decimal(str(expense.amount)) - (figures["amount"] if status == "pending" else Decimal(0)),
        "pay_date": pay,
        # An admin can act once the pay date has arrived (attendance for the
        # period is in by then) and only while the salary is still unpaid.
        "can_decide": status == "pending" and pay <= today,
        "decided_at": None,
        "decided_by": None,
    }


def _check_can_decide(db: Session, expense: Expense, *, deducting: bool) -> None:
    if not is_deductible(expense):
        raise DeductionError("Only salary payments can have an absence deduction")
    if decision_for(db, expense.id) is not None:
        raise DeductionError("A decision has already been made for this salary. Reopen it to change it")
    pay = pay_date(db, expense)
    if pay > date.today():
        raise DeductionError(
            f"This salary is paid on {pay:%d %b %Y}. "
            "The deduction can be confirmed from that date, once the attendance for the period is in"
        )
    if deducting and expense.is_paid:
        raise DeductionError("This salary has already been paid, so a deduction can no longer be taken from it")


def decide(
    db: Session, expense: Expense, user_id: int, *, confirm: bool, note: str | None = None
) -> SalaryDeduction:
    """Confirm (take it off the salary) or waive (take nothing) a pending
    deduction. Recomputed here from attendance -- the client never supplies
    the figure. The caller commits."""
    _check_can_decide(db, expense, deducting=confirm)
    figures = compute(db, expense)
    if figures["deduction_days"] == 0:
        raise DeductionError("There is nothing to deduct for this salary")

    amount = figures["amount"] if confirm else Decimal("0.00")
    row = SalaryDeduction(
        business_id=expense.business_id,
        employee_id=expense.employee_id,
        expense_id=expense.id,
        decision=DeductionDecision.confirmed if confirm else DeductionDecision.waived,
        period_start=figures["period_start"],
        period_end=figures["period_end"],
        absent_days=figures["absent_days"],
        half_days=figures["half_days"],
        deduction_days=figures["deduction_days"],
        daily_rate=figures["daily_rate"],
        gross_amount=figures["gross_amount"],
        amount=amount,
        decided_by=user_id,
        decided_at=datetime.utcnow(),
        note=note,
    )
    db.add(row)
    if confirm:
        expense.amount = Decimal(str(expense.amount)) - amount
        # Say so on the entry itself, so anyone reading the Expenses list
        # sees why this month is less than the usual salary.
        expense.description = (
            f"{expense.description or 'Salary'} - {_days_text(row.deduction_days)} deducted ({amount:,.2f})"
        )[:1000]
    return row


def reopen(db: Session, expense: Expense) -> Decimal:
    """Undo a decision so it can be decided again. Puts back any money that
    was deducted. Returns the amount restored. The caller commits."""
    row = decision_for(db, expense.id)
    if row is None:
        raise DeductionError("There is no decision to reopen")
    if expense.is_paid:
        raise DeductionError("This salary has already been paid, so the decision can no longer be changed")
    restored = Decimal(str(row.amount))
    if row.decision == DeductionDecision.confirmed:
        expense.amount = Decimal(str(expense.amount)) + restored
        suffix = f" - {_days_text(row.deduction_days)} deducted ({restored:,.2f})"
        if expense.description and expense.description.endswith(suffix):
            expense.description = expense.description[: -len(suffix)] or None
    db.delete(row)
    return restored


def _days_text(days) -> str:
    days = Decimal(str(days))
    text = f"{days:f}".rstrip("0").rstrip(".") if days % 1 else f"{int(days)}"
    return f"{text} day{'' if days == 1 else 's'}"


def pending_alerts(db: Session, business_id: int) -> list[dict]:
    """Salaries whose pay date has arrived and that are still unpaid -- what
    admins see in the notification bell. Each carries its deduction state so
    the decision can be made right from the alert."""
    today = date.today()
    rows = (
        db.query(Expense)
        .filter(
            Expense.business_id == business_id,
            Expense.type == ExpenseType.salary,
            Expense.employee_id.isnot(None),
            Expense.is_paid.is_(False),
            Expense.date <= today,
            # the pay date is in the same month as the entry, so this cheap
            # bound keeps the scan small before the exact check below
            Expense.date >= today - timedelta(days=ALERT_WINDOW_DAYS + 31),
        )
        .all()
    )
    alerts = []
    for expense in rows:
        pay = pay_date(db, expense)
        if pay > today or pay < today - timedelta(days=ALERT_WINDOW_DAYS):
            continue
        alerts.append((pay, expense, summarize(db, expense)))
    alerts.sort(key=lambda item: (item[0], item[1].id))
    return [{"expense": e, "summary": s} for _, e, s in alerts]
