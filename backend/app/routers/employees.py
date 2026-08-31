from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id, require_admin
from app.models.employee import Employee
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeResponse])
def list_employees(
    active_only: bool = Query(default=True),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Employee).filter(Employee.business_id == business_id)
    if active_only:
        q = q.filter(Employee.is_active.is_(True))
    return q.order_by(Employee.name).all()


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
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
    current_user=Depends(require_admin),
):
    employee = db.get(Employee, employee_id)
    if not employee or employee.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="employee", entity_id=employee.id, description=f"Updated employee {employee.name}",
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_employee(
    employee_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    employee = db.get(Employee, employee_id)
    if not employee or employee.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    employee.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="employee", entity_id=employee.id, description=f"Deactivated employee {employee.name}",
    )
    db.commit()
