from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_manager, require_module_enabled
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

router = APIRouter(
    prefix="/api/attendance", tags=["attendance"], dependencies=[Depends(require_module_enabled("attendance"))]
)


# Statuses where the person actually came in, so arrival/departure apply.
WORKED_STATUSES = (AttendanceStatus.present, AttendanceStatus.half_day)


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
    current_user=Depends(require_manager),
):
    """Set someone's status for a day, and/or when they arrived and left.

    Partial by design: only the optional fields the request actually carries
    (note, check_in, check_out) are written, so tapping "Present" again never
    erases an arrival time, and typing a time never erases a note.
    """
    employee = db.get(Employee, payload.employee_id)
    if not employee or employee.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    sent = payload.model_fields_set
    if payload.status not in WORKED_STATUSES and (payload.check_in or payload.check_out):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arrival and departure times only apply to a day the person was in (present or half day)",
        )

    record = (
        db.query(Attendance)
        .filter(Attendance.employee_id == payload.employee_id, Attendance.date == payload.date)
        .first()
    )
    created = record is None
    if created:
        record = Attendance(
            business_id=business_id, employee_id=payload.employee_id, date=payload.date, status=payload.status
        )
        db.add(record)

    record.status = payload.status
    record.business_id = business_id
    if "note" in sent:
        record.note = payload.note
    if "check_in" in sent:
        record.check_in = payload.check_in
    if "check_out" in sent:
        record.check_out = payload.check_out
    # Absent / on leave means they weren't in the office: any earlier times
    # would now contradict the status, so they go. A half day was in for part
    # of it, so it keeps its times.
    if payload.status not in WORKED_STATUSES:
        record.check_in = None
        record.check_out = None
    # A departure with no recorded arrival can't be measured or trusted.
    if record.check_out and not record.check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Record the arrival time before the departure")
    if record.check_in and record.check_out and record.check_out <= record.check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Check-out must be after check-in")

    db.flush()
    times = ""
    if record.check_in:
        times = f" (in {record.check_in.strftime('%H:%M')}" + (
            f", out {record.check_out.strftime('%H:%M')})" if record.check_out else ")"
        )
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create" if created else "update",
        entity_type="attendance", entity_id=record.id,
        description=f"Marked {employee.name} as {payload.status.value} on {payload.date}{times}",
    )
    db.commit()
    db.refresh(record)
    return record


@router.get("/day", response_model=DayAttendanceResponse)
def day_attendance(
    date_: date = Query(alias="date"),
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
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
            check_in=records[emp.id].check_in if emp.id in records else None,
            check_out=records[emp.id].check_out if emp.id in records else None,
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
    current_user=Depends(require_manager),
):
    employees = _active_employees(db, business_id)
    records = (
        db.query(Attendance)
        .filter(Attendance.business_id == business_id, Attendance.date >= date_from, Attendance.date <= date_to)
        .all()
    )

    counts: dict[int, dict[str, int]] = {
        emp.id: {"present": 0, "absent": 0, "half_day": 0, "leave": 0} for emp in employees
    }
    seconds: dict[int, int] = {emp.id: 0 for emp in employees}
    for r in records:
        if r.employee_id in counts:
            counts[r.employee_id][r.status.value] += 1
            if r.check_in and r.check_out:
                seconds[r.employee_id] += (
                    (r.check_out.hour * 3600 + r.check_out.minute * 60 + r.check_out.second)
                    - (r.check_in.hour * 3600 + r.check_in.minute * 60 + r.check_in.second)
                )

    return [
        EmployeeTotals(
            employee_id=emp.id,
            employee_name=emp.name,
            present=counts[emp.id]["present"],
            absent=counts[emp.id]["absent"],
            half_day=counts[emp.id]["half_day"],
            leave=counts[emp.id]["leave"],
            hours_worked=round(max(seconds[emp.id], 0) / 3600, 2),
        )
        for emp in employees
    ]


@router.get("/today-strip", response_model=TodayStrip)
def today_strip(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    today = date.today()
    employees = _active_employees(db, business_id)
    records = {
        a.employee_id: a.status
        for a in db.query(Attendance).filter(Attendance.business_id == business_id, Attendance.date == today).all()
    }
    present = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.present)
    absent = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.absent)
    half = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.half_day)
    leave = sum(1 for e in employees if records.get(e.id) == AttendanceStatus.leave)
    unmarked = len(employees) - present - absent - half - leave
    return TodayStrip(
        present_today=present, absent_today=absent, half_day_today=half, leave_today=leave, unmarked_today=unmarked
    )
