import { apiClient } from "./client";
import type { AttendanceStatus, DayAttendanceEntry, EmployeeTotals } from "./types";

export async function getDayAttendance(date: string): Promise<DayAttendanceEntry[]> {
  const res = await apiClient.get<{ date: string; entries: DayAttendanceEntry[] }>("/api/attendance/day", {
    params: { date },
  });
  return res.data.entries;
}

export async function markAttendance(employeeId: number, date: string, status: AttendanceStatus, note?: string): Promise<void> {
  await apiClient.post("/api/attendance/mark", { employee_id: employeeId, date, status, note: note || null });
}

export async function getAttendanceTotals(dateFrom: string, dateTo: string): Promise<EmployeeTotals[]> {
  const res = await apiClient.get<EmployeeTotals[]>("/api/attendance/totals", {
    params: { date_from: dateFrom, date_to: dateTo },
  });
  return res.data;
}
