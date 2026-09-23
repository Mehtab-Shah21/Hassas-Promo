import { apiClient } from "./client";
import type { AttendanceStatus, DayAttendanceEntry, EmployeeTotals } from "./types";

export async function getDayAttendance(date: string): Promise<DayAttendanceEntry[]> {
  const res = await apiClient.get<{ date: string; entries: DayAttendanceEntry[] }>("/api/attendance/day", {
    params: { date },
  });
  return res.data.entries;
}

/**
 * Set a day's status and/or arrival and departure times. Only what's passed is
 * sent: omitting `times` leaves any recorded times alone (tapping "Present"
 * again must not wipe them), while passing null for one clears it.
 */
export async function markAttendance(
  employeeId: number,
  date: string,
  status: AttendanceStatus,
  times?: { check_in?: string | null; check_out?: string | null },
): Promise<void> {
  await apiClient.post("/api/attendance/mark", { employee_id: employeeId, date, status, ...times });
}

export async function getAttendanceTotals(dateFrom: string, dateTo: string): Promise<EmployeeTotals[]> {
  const res = await apiClient.get<EmployeeTotals[]>("/api/attendance/totals", {
    params: { date_from: dateFrom, date_to: dateTo },
  });
  return res.data;
}
