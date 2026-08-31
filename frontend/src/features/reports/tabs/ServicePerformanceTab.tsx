import { useEffect, useState } from "react";
import { downloadCsv, getServicePerformance, type ServicePerformanceRow } from "../../../api/reports";
import { monthStart, ReportToolbar, today } from "../ReportToolbar";

export default function ServicePerformanceTab() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [rows, setRows] = useState<ServicePerformanceRow[]>([]);

  useEffect(() => {
    getServicePerformance({ date_from: dateFrom, date_to: dateTo }).then(setRows);
  }, [dateFrom, dateTo]);

  return (
    <div>
      <ReportToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onExportCsv={() => downloadCsv("/api/reports/service-performance", { date_from: dateFrom, date_to: dateTo }, "service_performance.csv")}
      />
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold uppercase text-muted">
          <tr><th className="py-1.5">Service</th><th className="text-right">Count</th><th className="text-right">Revenue</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.service}><td className="py-1.5">{r.service}</td><td className="text-right">{r.count}</td><td className="text-right">{r.revenue.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
