from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.models.attendance import Attendance, AttendanceStatus
from app.models.employee import Employee
from app.schemas.attendance import (
    AttendanceMark,
    AttendanceResponse,
    DayAttendanceEntry,
    DayAttendanceResponse,
    EmployeeTotals,
    TodayStrip,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _active_employees(db: Session, business_id: int) -> list[Employee]:
    return (
        db.query(Employee)
        .filter(Employee.business_id == business_id, Employee.is_active.is_(True))
        .order_by(Employee.name)
        .all()
    )


@router.post("/mark", response_model=AttendanceResponse)
def mark_attendance(
    payload: AttendanceMark,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    existing = (
        db.query(Attendance)
        .filter(Attendance.employee_id == payload.employee_id, Attendance.date == payload.date)
        .first()
    )
    if existing:
        existing.status = payload.status
        existing.note = payload.note
        existing.business_id = business_id
        write_audit_log(
            db, user_id=current_user.id, business_id=business_id, action="update",
            entity_type="attendance", entity_id=existing.id,
            description=f"Marked employee {payload.employee_id} as {payload.status.value} on {payload.date}",
        )
        db.commit()
        db.refresh(existing)
        return existing

    record = Attendance(
        business_id=business_id,
        employee_id=payload.employee_id,
        date=payload.date,
        status=payload.status,
        note=payload.note,
    )
    db.add(record)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="attendance", entity_id=record.id,
        description=f"Marked employee {payload.employee_id} as {payload.status.value} on {payload.date}",
    )
    db.commit()
    db.refresh(record)
    return record


@router.get("/day", response_model=DayAttendanceResponse)
def day_attendance(
    date_: date = Query(alias="date"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    employees = _active_employees(db, business_id)
    records = {
        a.employee_id: a
        for a in db.query(Attendance).filter(Attendance.business_id == business_id, Attendance.date == date_).all()
    }
    entries = [
        DayAttendanceEntry(
            employee_id=emp.id,
            employee_name=emp.name,
            status=records[emp.id].status if emp.id in records else None,
            note=records[emp.id].note if emp.id in records else None,
        )
        for emp in employees
    ]
    return DayAttendanceResponse(date=date_, entries=entries)


@router.get("/totals", response_model=list[EmployeeTotals])
def totals(
    date_from: date = Query(...),
    date_to: date = Query(...),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    employees = _active_employees(db, business_id)
    records = (
        db.query(Attendance)
        .filter(Attendance.business_id == business_id, Attendance.date >= date_from, Attendance.date <= date_to)
        .all()
    )

    counts: dict[int, dict[str, int]] = {emp.id: {"present": 0, "absent": 0, "leave": 0} for emp in employees}
    for r in records:
        if r.employee_id in counts:
            counts[r.employee_id][r.status.value] += 1

    return [
        EmployeeTotals(
            employee_id=emp.id,
            employee_name=emp.name,
            present=counts[emp.id]["present"],
            absent=counts[emp.id]["absent"],
            leave=counts[emp.id]["leave"],
        )
        for emp in employees
    ]


@router.get("/today-strip", response_model=TodayStrip)
def today_strip(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    today = date.today()
    employees = _active_employees(db, business_id)
    records = {
        a.employee_id: a.status
        for a in db.query(Attendance).filter(Attendance.business_id == business_id, Attendance.date == today).all()
    }
    present = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.present)
    absent = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.absent)
    leave = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.leave)
    unmarked = len(employees) - present - absent - leave
    return TodayStrip(present_today=present, absent_today=absent, leave_today=leave, unmarked_today=unmarked)
