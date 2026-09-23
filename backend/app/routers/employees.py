import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_active_business_id, require_manager, require_module_enabled
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.models.recurring_expense import RecurringExpense
from app.models.expense import ExpenseType
from app.models.user import User
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeDetailResponse,
    EmployeeDocumentResponse,
    EmployeeResponse,
    EmployeeSalaryEntry,
    EmployeeUpdate,
)
from app.routers.salary_deductions import to_summary
from app.services.audit import write_audit_log
from app.services.recurring_expenses import salary_status_for_employee

# The Employee Management module's staff roster (distinct from a company
# customer's employees). Still gated by the same flag as attendance -- they
# are one module in the UI ("Employees"), attendance being one of the things
# you do to an employee.
router = APIRouter(
    prefix="/api/employees", tags=["employees"], dependencies=[Depends(require_module_enabled("attendance"))]
)

UPLOAD_DIR = Path(settings.upload_dir)
# An ID scan is whatever the phone or the office scanner produced.
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
DOCUMENT_FIELDS = {
    "emirates-id": "emirates_id_attachment_path",
    "passport": "passport_attachment_path",
}
# Beyond Emirates ID and passport, an employee can have any number of other
# named files (a license, a work permit, a certificate) -- this just keeps a
# typo or a stuck script from piling up an unbounded number of them.
MAX_OTHER_DOCUMENTS = 20


def _get_employee(db: Session, employee_id: int, business_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee or employee.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


def _validated_upload(file: UploadFile) -> tuple[str, bytes]:
    """Common checks for any employee document upload -- an allowed type,
    under the size cap. Returns (extension, contents)."""
    extension = ALLOWED_DOCUMENT_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Document must be a PDF or an image (JPG, PNG, WebP)"
        )
    contents = file.file.read(MAX_DOCUMENT_BYTES + 1)
    if len(contents) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document must be under 10MB")
    return extension, contents


@router.get("", response_model=list[EmployeeResponse])
def list_employees(
    active_only: bool = Query(default=True),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    q = db.query(Employee).filter(Employee.business_id == business_id)
    if active_only:
        q = q.filter(Employee.is_active.is_(True))
    return q.order_by(Employee.name).all()


@router.get("/{employee_id}", response_model=EmployeeDetailResponse)
def employee_detail(
    employee_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Everything about one person: their record and documents, whether they
    have a login, this month's attendance, the standing monthly salary the
    system generates for them, and what's been paid versus still owed."""
    employee = _get_employee(db, employee_id, business_id)

    account = db.query(User).filter(User.employee_id == employee.id).first()

    today = date.today()
    month_first = today.replace(day=1)
    attendance_rows = (
        db.query(Attendance)
        .filter(
            Attendance.business_id == business_id,
            Attendance.employee_id == employee.id,
            Attendance.date >= month_first,
            Attendance.date <= today,
        )
        .all()
    )

    recurring = (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.business_id == business_id,
            RecurringExpense.employee_id == employee.id,
            RecurringExpense.type == ExpenseType.salary,
            RecurringExpense.is_active.is_(True),
        )
        .first()
    )

    salary = salary_status_for_employee(db, employee.id, business_id)
    documents = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.employee_id == employee.id)
        .order_by(EmployeeDocument.created_at)
        .all()
    )

    return EmployeeDetailResponse(
        employee=EmployeeResponse.model_validate(employee),
        user_id=account.id if account else None,
        username=account.username if account else None,
        user_role=account.role.value if account else None,
        present_days=sum(1 for a in attendance_rows if a.status.value == "present"),
        absent_days=sum(1 for a in attendance_rows if a.status.value == "absent"),
        half_days=sum(1 for a in attendance_rows if a.status.value == "half_day"),
        leave_days=sum(1 for a in attendance_rows if a.status.value == "leave"),
        recurring_salary_amount=float(recurring.amount) if recurring else None,
        total_paid=salary["total_paid"],
        total_pending=salary["total_pending"],
        salary_entries=[
            EmployeeSalaryEntry.model_validate(e).model_copy(update={"deduction": to_summary(db, e)})
            for e in salary["entries"]
        ],
        documents=[EmployeeDocumentResponse.model_validate(d) for d in documents],
    )


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    employee = Employee(business_id=business_id, **payload.model_dump())
    db.add(employee)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="employee", entity_id=employee.id, description=f"Added employee {employee.name}",
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    employee = _get_employee(db, employee_id, business_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="employee", entity_id=employee.id, description=f"Updated employee {employee.name}",
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.post("/{employee_id}/documents/{document}", response_model=EmployeeResponse)
def upload_employee_document(
    employee_id: int,
    document: str,
    file: UploadFile,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Attach a scan of the Emirates ID or passport. `document` is
    "emirates-id" or "passport"."""
    field = DOCUMENT_FIELDS.get(document)
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document type")
    employee = _get_employee(db, employee_id, business_id)
    extension, contents = _validated_upload(file)

    old_path = getattr(employee, field)
    filename = f"employee-{employee_id}-{document}-{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(contents)
    setattr(employee, field, f"/uploads/{filename}")
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="employee", entity_id=employee.id,
        description=f"Uploaded {document.replace('-', ' ')} document for {employee.name}",
    )
    db.commit()
    db.refresh(employee)

    if old_path:
        try:
            (UPLOAD_DIR / Path(old_path).name).unlink(missing_ok=True)
        except OSError:
            pass  # the record already points at the new file; a stray old one isn't worth failing over
    return employee


@router.post(
    "/{employee_id}/documents", response_model=EmployeeDocumentResponse, status_code=status.HTTP_201_CREATED
)
def add_employee_document(
    employee_id: int,
    file: UploadFile,
    name: str = Form(..., max_length=150),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Attach one more named file -- a license, a work permit, a certificate,
    anything beyond the Emirates ID and passport. An employee can have any
    number of these; each is just a name and a file."""
    employee = _get_employee(db, employee_id, business_id)
    name = name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Give the document a name")

    existing = (
        db.query(func.count(EmployeeDocument.id)).filter(EmployeeDocument.employee_id == employee.id).scalar() or 0
    )
    if existing >= MAX_OTHER_DOCUMENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An employee can have at most {MAX_OTHER_DOCUMENTS} extra documents",
        )

    extension, contents = _validated_upload(file)
    filename = f"employee-{employee_id}-doc-{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(contents)

    document = EmployeeDocument(
        business_id=business_id,
        employee_id=employee.id,
        name=name,
        file_path=f"/uploads/{filename}",
        uploaded_by=current_user.id,
    )
    db.add(document)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="employee", entity_id=employee.id, description=f"Attached '{name}' to {employee.name}",
    )
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{employee_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_employee_document(
    employee_id: int,
    document_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    employee = _get_employee(db, employee_id, business_id)
    document = db.get(EmployeeDocument, document_id)
    if not document or document.employee_id != employee.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="employee", entity_id=employee.id, description=f"Removed '{document.name}' from {employee.name}",
    )
    file_path = document.file_path
    db.delete(document)
    db.commit()

    if file_path:
        try:
            (UPLOAD_DIR / Path(file_path).name).unlink(missing_ok=True)
        except OSError:
            pass  # the record is already gone; a stray file isn't worth failing the request over


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_employee(
    employee_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    employee = _get_employee(db, employee_id, business_id)
    employee.is_active = False
    # Someone who has left shouldn't keep generating a salary every month.
    # Their history stays exactly as it was -- only future months stop.
    stopped = (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.business_id == business_id,
            RecurringExpense.employee_id == employee.id,
            RecurringExpense.is_active.is_(True),
        )
        .all()
    )
    for definition in stopped:
        definition.is_active = False

    note = f" (stopped {len(stopped)} recurring salary definition(s))" if stopped else ""
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="employee", entity_id=employee.id,
        description=f"Deactivated employee {employee.name}{note}",
    )
    db.commit()
