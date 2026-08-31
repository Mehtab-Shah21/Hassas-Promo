import { useEffect, useState } from "react";
import { downloadCsv, getAttendanceSummaryReport, type AttendanceSummaryRow } from "../../../api/reports";
import { monthStart, ReportToolbar, today } from "../ReportToolbar";

export default function AttendanceSummaryTab() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);

  useEffect(() => {
    getAttendanceSummaryReport({ date_from: dateFrom, date_to: dateTo }).then(setRows);
  }, [dateFrom, dateTo]);

  return (
    <div>
      <ReportToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onExportCsv={() => downloadCsv("/api/reports/attendance-summary", { date_from: dateFrom, date_to: dateTo }, "attendance_summary.csv")}
      />
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold uppercase text-muted">
          <tr><th className="py-1.5">Employee</th><th className="text-right">Present</th><th className="text-right">Absent</th><th className="text-right">Leave</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.employee}><td className="py-1.5">{r.employee}</td><td className="text-right text-accent-green">{r.present}</td><td className="text-right text-danger">{r.absent}</td><td className="text-right text-orange-50">{r.leave}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
