from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_manager
from app.models.employee import Employee
from app.models.expense import Expense, ExpenseType
from app.models.recurring_expense import RecurringExpense
from app.schemas.recurring_expense import (
    FixedCostSummary,
    RecurringExpenseCreate,
    RecurringExpenseResponse,
    RecurringExpenseUpdate,
)
from app.services.audit import write_audit_log
from app.services.recurring_expenses import (
    generate_due_expenses,
    generate_for_definition,
    month_status,
    monthly_commitment,
    reconcile_after_end_date_change,
)

# Same manager-and-above gate as the one-off Expenses module it belongs to.
router = APIRouter(
    prefix="/api/recurring-expenses", tags=["recurring-expenses"], dependencies=[Depends(require_manager)]
)


def _generated_counts(db: Session, business_id: int) -> dict[int, int]:
    rows = (
        db.query(Expense.recurring_expense_id, func.count(Expense.id))
        .filter(Expense.business_id == business_id, Expense.recurring_expense_id.isnot(None))
        .group_by(Expense.recurring_expense_id)
        .all()
    )
    return {definition_id: count for definition_id, count in rows}


def _to_response(
    definition: RecurringExpense, employee_names: dict[int, str], counts: dict[int, int]
) -> RecurringExpenseResponse:
    return RecurringExpenseResponse(
        id=definition.id,
        business_id=definition.business_id,
        type=definition.type,
        label=definition.label,
        amount=float(definition.amount),
        employee_id=definition.employee_id,
        employee_name=employee_names.get(definition.employee_id) if definition.employee_id else None,
        day_of_month=definition.day_of_month,
        pay_day=definition.pay_day,
        start_date=definition.start_date,
        end_date=definition.end_date,
        is_active=definition.is_active,
        created_by=definition.created_by,
        generated_count=counts.get(definition.id, 0),
    )


def _resolve_employee(db: Session, business_id: int, employee_id: int | None) -> Employee | None:
    if employee_id is None:
        return None
    employee = db.get(Employee, employee_id)
    if not employee or employee.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")
    return employee


@router.get("", response_model=list[RecurringExpenseResponse])
def list_recurring_expenses(
    include_inactive: bool = True,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    # Opening the page is also the cue to bring the current month up to date,
    # so what's on screen is never behind the calendar.
    generate_due_expenses(db, business_id)

    q = db.query(RecurringExpense).filter(RecurringExpense.business_id == business_id)
    if not include_inactive:
        q = q.filter(RecurringExpense.is_active.is_(True))
    definitions = q.order_by(RecurringExpense.type, RecurringExpense.label).all()

    employee_names = {e.id: e.name for e in db.query(Employee).filter(Employee.business_id == business_id).all()}
    counts = _generated_counts(db, business_id)
    return [_to_response(d, employee_names, counts) for d in definitions]


@router.get("/summary", response_model=FixedCostSummary)
def fixed_cost_summary(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    generate_due_expenses(db, business_id)
    status_now = month_status(db, business_id)
    active_count = (
        db.query(func.count(RecurringExpense.id))
        .filter(RecurringExpense.business_id == business_id, RecurringExpense.is_active.is_(True))
        .scalar()
        or 0
    )
    return FixedCostSummary(
        monthly_commitment=monthly_commitment(db, business_id),
        active_count=active_count,
        **status_now,
    )


@router.post("", response_model=RecurringExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_expense(
    payload: RecurringExpenseCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    employee = _resolve_employee(db, business_id, payload.employee_id)

    definition = RecurringExpense(
        business_id=business_id,
        type=payload.type,
        label=payload.label or (employee.name if employee else ""),
        amount=payload.amount,
        employee_id=payload.employee_id,
        day_of_month=payload.day_of_month,
        # a pay day only means something for a salary
        pay_day=payload.pay_day if payload.type == ExpenseType.salary else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by=current_user.id,
    )
    db.add(definition)
    db.flush()

    # Fill in from its start month through today immediately, so the list
    # isn't empty until some background tick happens to run.
    created = generate_for_definition(db, definition)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="recurring_expense", entity_id=definition.id,
        description=f"Added fixed monthly {definition.type.value} '{definition.label}' of {definition.amount}"
        + (f" ({len(created)} month(s) generated)" if created else ""),
    )
    db.commit()
    db.refresh(definition)

    employee_names = {employee.id: employee.name} if employee else {}
    return _to_response(definition, employee_names, _generated_counts(db, business_id))


@router.patch("/{definition_id}", response_model=RecurringExpenseResponse)
def update_recurring_expense(
    definition_id: int,
    payload: RecurringExpenseUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Change a standing cost. Months already generated are deliberately left
    alone -- a rent increase or a raise applies from here on, and what was
    actually paid in past months stays exactly as recorded. The one exception
    is moving the END DATE, which re-prorates the months around it (see
    reconcile_after_end_date_change) -- but only entries that are still
    unpaid, undocumented and unedited."""
    definition = db.get(RecurringExpense, definition_id)
    if not definition or definition.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixed monthly cost not found")

    data = payload.model_dump(exclude_unset=True)
    if "employee_id" in data:
        if definition.type == ExpenseType.salary and data["employee_id"] is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="A recurring salary must stay linked to an employee"
            )
        _resolve_employee(db, business_id, data["employee_id"])
    if data.get("end_date") is not None and data["end_date"] < definition.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The end date can't be before the start date"
        )

    if "pay_day" in data and definition.type != ExpenseType.salary:
        data.pop("pay_day")  # only a salary has a pay day

    was_active = definition.is_active
    old_end_date = definition.end_date
    old_amount = definition.amount
    for field, value in data.items():
        setattr(definition, field, value)

    # Moving the end date changes what the months around it should be charged:
    # a month already generated in full may now be partial, and months past a
    # new, earlier end shouldn't exist. Only untouched, unpaid entries move.
    adjusted = removed = 0
    if "end_date" in data and definition.end_date != old_end_date:
        adjusted, removed = reconcile_after_end_date_change(db, definition, old_end_date, rate=old_amount)

    if data.get("is_active") is True and not was_active:
        # Re-enabling catches up any months missed while it was stopped.
        generate_for_definition(db, definition)

    if "is_active" in data:
        what = "Resumed" if data["is_active"] else "Stopped"
        description = f"{what} fixed monthly {definition.type.value} '{definition.label}'"
    elif "end_date" in data and (adjusted or removed):
        description = (
            f"Set '{definition.label}' to end on {definition.end_date}"
            f" ({adjusted} month(s) re-prorated, {removed} removed)"
        )
    elif "end_date" in data:
        description = f"Set '{definition.label}' to end on {definition.end_date}" if definition.end_date else (
            f"Removed the end date from '{definition.label}'"
        )
    elif "pay_day" in data and len(data) == 1:
        description = f"Set '{definition.label}' to be paid on " + (
            f"day {definition.pay_day}" if definition.pay_day else "the last day of the month"
        )
    elif "amount" in data:
        description = f"Changed '{definition.label}' to {definition.amount} from this month on"
    else:
        description = f"Updated fixed monthly cost '{definition.label}'"
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="recurring_expense", entity_id=definition.id, description=description,
    )
    db.commit()
    db.refresh(definition)

    employee_names = {e.id: e.name for e in db.query(Employee).filter(Employee.business_id == business_id).all()}
    return _to_response(definition, employee_names, _generated_counts(db, business_id))


@router.post("/generate", response_model=FixedCostSummary)
def generate_now(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Manual catch-up. Generation already happens on its own; this is the
    "run it now" button for anyone who wants to see it happen."""
    generate_due_expenses(db, business_id)
    status_now = month_status(db, business_id)
    active_count = (
        db.query(func.count(RecurringExpense.id))
        .filter(RecurringExpense.business_id == business_id, RecurringExpense.is_active.is_(True))
        .scalar()
        or 0
    )
    return FixedCostSummary(
        monthly_commitment=monthly_commitment(db, business_id),
        active_count=active_count,
        **status_now,
    )


@router.delete("/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
def stop_recurring_expense(
    definition_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Stop a standing cost from here on. Never deletes the definition or any
    month already generated -- an employee who left still has their salary
    history, and a cancelled overhead still shows in the months it applied."""
    definition = db.get(RecurringExpense, definition_id)
    if not definition or definition.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixed monthly cost not found")
    definition.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="recurring_expense", entity_id=definition.id,
        description=f"Stopped fixed monthly {definition.type.value} '{definition.label}'",
    )
    db.commit()
