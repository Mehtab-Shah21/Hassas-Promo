from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin, require_manager, require_module_enabled
from app.models.employee import Employee
from app.models.expense import Expense
from app.models.user import User
from app.schemas.salary_deduction import DecisionRequest, DeductionSummary, SalaryAlert
from app.services.audit import write_audit_log
from app.services.recurring_expenses import generate_due_expenses
from app.services.salary_deductions import (
    DeductionError,
    decide,
    is_deductible,
    pending_alerts,
    reopen,
    summarize,
)

# Part of the Employees module, so it follows the same on/off flag as attendance.
router = APIRouter(
    prefix="/api/salary-deductions",
    tags=["salary-deductions"],
    dependencies=[Depends(require_module_enabled("attendance"))],
)


def to_summary(db: Session, expense: Expense) -> DeductionSummary:
    """Build the API shape for one salary payment. Also used by the employee
    detail view, so both always show the same working."""
    data = summarize(db, expense)
    decided_by_name = None
    if data["decided_by"]:
        user = db.get(User, data["decided_by"])
        if user:
            decided_by_name = user.display_name or user.username
    return DeductionSummary(
        status=data["status"],
        period_start=data["period_start"],
        period_end=data["period_end"],
        covered_days=data["covered_days"],
        absent_days=data["absent_days"],
        half_days=data["half_days"],
        deduction_days=float(data["deduction_days"]),
        daily_rate=float(data["daily_rate"]),
        gross_amount=float(data["gross_amount"]),
        amount=float(data["amount"]),
        net_amount=float(data["net_amount"]),
        pay_date=data["pay_date"],
        can_decide=data["can_decide"],
        decided_at=data["decided_at"],
        decided_by_name=decided_by_name,
    )


def _get_salary(db: Session, expense_id: int, business_id: int) -> Expense:
    expense = db.get(Expense, expense_id)
    if not expense or expense.business_id != business_id or not is_deductible(expense):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary payment not found")
    return expense


@router.get("/alerts", response_model=list[SalaryAlert])
def salary_alerts(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Salaries that have reached their pay date and are still unpaid --
    admins and superadmins only. Drives the notification bell: each entry
    carries its deduction so it can be confirmed straight from there."""
    # A salary that hasn't been generated yet can't alert anyone; opening the
    # bell is a fine moment to bring this month up to date.
    generate_due_expenses(db, business_id)

    names = {e.id: e.name for e in db.query(Employee).filter(Employee.business_id == business_id).all()}
    today = date.today()
    return [
        SalaryAlert(
            expense_id=item["expense"].id,
            employee_id=item["expense"].employee_id,
            employee_name=names.get(item["expense"].employee_id, "—"),
            description=item["expense"].description,
            pay_date=item["summary"]["pay_date"],
            days_since_pay_date=(today - item["summary"]["pay_date"]).days,
            deduction=to_summary(db, item["expense"]),
        )
        for item in pending_alerts(db, business_id)
    ]


@router.get("/expense/{expense_id}", response_model=DeductionSummary)
def get_deduction(
    expense_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    return to_summary(db, _get_salary(db, expense_id, business_id))


def _decide(expense_id: int, payload: DecisionRequest, confirm: bool, business_id: int, db: Session, user) -> DeductionSummary:
    expense = _get_salary(db, expense_id, business_id)
    employee = db.get(Employee, expense.employee_id)
    try:
        row = decide(db, expense, user.id, confirm=confirm, note=payload.note)
    except DeductionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.flush()
    name = employee.name if employee else f"employee #{expense.employee_id}"
    if confirm:
        description = (
            f"Confirmed absence deduction of {row.amount} ({row.deduction_days} day(s): "
            f"{row.absent_days} absent, {row.half_days} half day) from {name}'s salary"
        )
    else:
        description = f"Waived the absence deduction ({row.deduction_days} day(s)) on {name}'s salary"
    write_audit_log(
        db, user_id=user.id, business_id=business_id, action="update",
        entity_type="expense", entity_id=expense.id, description=description,
    )
    db.commit()
    db.refresh(expense)
    return to_summary(db, expense)


@router.post("/expense/{expense_id}/confirm", response_model=DeductionSummary)
def confirm_deduction(
    expense_id: int,
    payload: DecisionRequest | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Take the absence deduction off this salary. Admin / superadmin only."""
    return _decide(expense_id, payload or DecisionRequest(), True, business_id, db, current_user)


@router.post("/expense/{expense_id}/waive", response_model=DeductionSummary)
def waive_deduction(
    expense_id: int,
    payload: DecisionRequest | None = None,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Decide not to deduct anything this time. Admin / superadmin only."""
    return _decide(expense_id, payload or DecisionRequest(), False, business_id, db, current_user)


@router.post("/expense/{expense_id}/reopen", response_model=DeductionSummary)
def reopen_deduction(
    expense_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Undo a confirm/waive (while the salary is still unpaid) so it can be
    decided again; any money that was deducted is put back."""
    expense = _get_salary(db, expense_id, business_id)
    try:
        restored = reopen(db, expense)
    except DeductionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    employee = db.get(Employee, expense.employee_id)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="expense", entity_id=expense.id,
        description=(
            f"Reopened the absence deduction on {employee.name if employee else 'a'} salary"
            + (f" ({restored} restored)" if restored else "")
        ),
    )
    db.commit()
    db.refresh(expense)
    return to_summary(db, expense)
