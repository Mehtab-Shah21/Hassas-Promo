import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.models.employee import Employee
from app.models.expense import Expense, ExpenseType
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseSummary,
    ExpenseUpdate,
    PaginatedExpenses,
)
from app.services.audit import write_audit_log
from app.services.expenses import build_expense_query, expenses_by_type, total_expenses

router = APIRouter(prefix="/api/expenses", tags=["expenses"], dependencies=[Depends(require_admin)])

UPLOAD_DIR = Path(settings.upload_dir)
ALLOWED_ATTACHMENT_TYPES = {"application/pdf"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def _to_response(expense: Expense, employee_names: dict[int, str]) -> ExpenseResponse:
    return ExpenseResponse(
        id=expense.id,
        business_id=expense.business_id,
        type=expense.type,
        amount=expense.amount,
        description=expense.description,
        date=expense.date,
        employee_id=expense.employee_id,
        employee_name=employee_names.get(expense.employee_id) if expense.employee_id else None,
        attachment_path=expense.attachment_path,
        created_by=expense.created_by,
    )


@router.get("", response_model=PaginatedExpenses)
def list_expenses(
    type: ExpenseType | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    q = build_expense_query(db, business_id, date_from, date_to, type)
    total = q.count()
    items = q.order_by(Expense.date.desc(), Expense.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    employee_names = {e.id: e.name for e in db.query(Employee).filter(Employee.business_id == business_id).all()}
    total_amount = total_expenses(db, business_id, date_from, date_to, type)

    return PaginatedExpenses(
        items=[_to_response(e, employee_names) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        total_amount=total_amount,
    )


@router.get("/summary", response_model=ExpenseSummary)
def expense_summary(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    return ExpenseSummary(
        total=total_expenses(db, business_id, date_from, date_to),
        by_type=expenses_by_type(db, business_id, date_from, date_to),
    )


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    employee = None
    if payload.employee_id is not None:
        employee = db.get(Employee, payload.employee_id)
        if not employee or employee.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")

    expense = Expense(
        business_id=business_id,
        type=payload.type,
        amount=payload.amount,
        description=payload.description,
        date=payload.date,
        employee_id=payload.employee_id,
        created_by=current_user.id,
    )
    db.add(expense)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="expense", entity_id=expense.id,
        description=f"Recorded {expense.type.value} expense of {expense.amount}"
        + (f" for {employee.name}" if employee else ""),
    )
    db.commit()
    db.refresh(expense)
    employee_names = {employee.id: employee.name} if employee else {}
    return _to_response(expense, employee_names)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    expense = db.get(Expense, expense_id)
    if not expense or expense.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    data = payload.model_dump(exclude_unset=True)
    new_type = data.get("type", expense.type)
    new_employee_id = data["employee_id"] if "employee_id" in data else expense.employee_id
    if new_type == ExpenseType.salary and new_employee_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A salary expense must be linked to an employee")
    if new_employee_id is not None:
        employee = db.get(Employee, new_employee_id)
        if not employee or employee.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")

    for field, value in data.items():
        setattr(expense, field, value)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="expense", entity_id=expense.id, description=f"Updated {expense.type.value} expense #{expense.id}",
    )
    db.commit()
    db.refresh(expense)
    employee_names = {}
    if expense.employee_id:
        emp = db.get(Employee, expense.employee_id)
        if emp:
            employee_names[emp.id] = emp.name
    return _to_response(expense, employee_names)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    expense = db.get(Expense, expense_id)
    if not expense or expense.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="expense", entity_id=expense.id,
        description=f"Deleted {expense.type.value} expense of {expense.amount}",
    )
    attachment_path = expense.attachment_path
    db.delete(expense)
    db.commit()

    if attachment_path:
        file_path = UPLOAD_DIR / Path(attachment_path).name
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            pass  # the DB record is already gone; a stray file isn't worth failing the request over


@router.post("/{expense_id}/attachment", response_model=ExpenseResponse)
def upload_attachment(
    expense_id: int,
    file: UploadFile,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    expense = db.get(Expense, expense_id)
    if not expense or expense.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment must be a PDF")
    contents = file.file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(contents) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment must be under 10MB")

    old_path = expense.attachment_path
    filename = f"expense-{expense_id}-{uuid.uuid4().hex}.pdf"
    (UPLOAD_DIR / filename).write_bytes(contents)
    expense.attachment_path = f"/uploads/{filename}"
    db.commit()
    db.refresh(expense)

    if old_path:
        try:
            (UPLOAD_DIR / Path(old_path).name).unlink(missing_ok=True)
        except OSError:
            pass

    employee_names = {}
    if expense.employee_id:
        emp = db.get(Employee, expense.employee_id)
        if emp:
            employee_names[emp.id] = emp.name
    return _to_response(expense, employee_names)
