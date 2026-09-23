import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.attendance import AttendanceStatus

# note length mirrors app/models/attendance.py's column.
#
# Field names are `date`/`check_in`, so they're annotated via `datetime.date` /
# `datetime.time` rather than bare imports -- same shadowing trap described in
# schemas/expense.py.


class AttendanceMark(BaseModel):
    employee_id: int
    date: datetime.date
    status: AttendanceStatus
    # Only fields actually present in the request are written (see the router,
    # which checks model_fields_set): re-marking someone present must not wipe
    # the arrival time that was already recorded, and recording a time must not
    # wipe the note.
    note: str | None = Field(default=None, max_length=500)
    check_in: datetime.time | None = None
    check_out: datetime.time | None = None

    @model_validator(mode="after")
    def _times_make_sense(self) -> "AttendanceMark":
        if self.check_in and self.check_out and self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in")
        return self


class AttendanceResponse(BaseModel):
    id: int
    business_id: int
    employee_id: int
    date: datetime.date
    status: AttendanceStatus
    note: str | None
    check_in: datetime.time | None = None
    check_out: datetime.time | None = None

    model_config = {"from_attributes": True}


class DayAttendanceEntry(BaseModel):
    employee_id: int
    employee_name: str
    status: AttendanceStatus | None
    note: str | None
    check_in: datetime.time | None = None
    check_out: datetime.time | None = None


class DayAttendanceResponse(BaseModel):
    date: datetime.date
    entries: list[DayAttendanceEntry]


class EmployeeTotals(BaseModel):
    employee_id: int
    employee_name: str
    present: int
    absent: int
    half_day: int = 0
    leave: int
    # Total time in the office over the range, from days that have both a
    # check-in and a check-out. Days with only an arrival (still in, or the
    # departure was never recorded) can't be measured and are left out.
    hours_worked: float = 0


class TodayStrip(BaseModel):
    present_today: int
    absent_today: int
    half_day_today: int = 0
    leave_today: int
    unmarked_today: int
