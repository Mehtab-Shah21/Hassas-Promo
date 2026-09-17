from datetime import date

from pydantic import BaseModel, Field

from app.models.attendance import AttendanceStatus

# note length mirrors app/models/attendance.py's column.


class AttendanceMark(BaseModel):
    employee_id: int
    date: date
    status: AttendanceStatus
    note: str | None = Field(default=None, max_length=500)


class AttendanceResponse(BaseModel):
    id: int
    business_id: int
    employee_id: int
    date: date
    status: AttendanceStatus
    note: str | None

    model_config = {"from_attributes": True}


class DayAttendanceEntry(BaseModel):
    employee_id: int
    employee_name: str
    status: AttendanceStatus | None
    note: str | None


class DayAttendanceResponse(BaseModel):
    date: date
    entries: list[DayAttendanceEntry]


class EmployeeTotals(BaseModel):
    employee_id: int
    employee_name: str
    present: int
    absent: int
    leave: int


class TodayStrip(BaseModel):
    present_today: int
    absent_today: int
    leave_today: int
    unmarked_today: int
