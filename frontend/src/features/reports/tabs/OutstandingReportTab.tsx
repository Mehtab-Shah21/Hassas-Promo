import { useEffect, useState } from "react";
import { downloadCsv, getOutstandingReport, type OutstandingRow } from "../../../api/reports";
import { ReportToolbar } from "../ReportToolbar";

export default function OutstandingReportTab() {
  const [rows, setRows] = useState<OutstandingRow[]>([]);

  useEffect(() => {
    getOutstandingReport().then(setRows);
  }, []);

  return (
    <div>
      <ReportToolbar showDates={false} onExportCsv={() => downloadCsv("/api/reports/outstanding", {}, "outstanding.csv")} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing outstanding.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-muted">
            <tr><th className="py-1.5">Customer</th><th>Invoice</th><th>Due date</th><th className="text-right">Days overdue</th><th className="text-right">Balance due</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.number}>
                <td className="py-1.5">{r.customer}</td>
                <td>{r.number}</td>
                <td>{r.due_date || "—"}</td>
                <td className={`text-right ${r.days_overdue > 0 ? "text-danger font-medium" : ""}`}>{r.days_overdue > 0 ? r.days_overdue : "—"}</td>
                <td className="text-right">{r.balance_due.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
