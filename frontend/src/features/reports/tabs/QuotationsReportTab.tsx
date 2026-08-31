import { useEffect, useState } from "react";
import { downloadCsv, getQuotationsReport, type QuotationsReport } from "../../../api/reports";
import { monthStart, ReportToolbar, today } from "../ReportToolbar";

export default function QuotationsReportTab() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState<QuotationsReport | null>(null);

  useEffect(() => {
    getQuotationsReport({ date_from: dateFrom, date_to: dateTo }).then(setData);
  }, [dateFrom, dateTo]);

  return (
    <div>
      <ReportToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onExportCsv={() => downloadCsv("/api/reports/quotations", { date_from: dateFrom, date_to: dateTo }, "quotations.csv")}
      />
      {data && (
        <>
          <div className="mb-4 grid grid-cols-5 gap-3">
            <Stat label="Created" value={data.counts.created} />
            <Stat label="Pending" value={data.counts.pending} />
            <Stat label="Accepted" value={data.counts.accepted} accent="text-accent-green" />
            <Stat label="Converted" value={data.counts.converted} accent="text-accent" />
            <Stat label="Rejected" value={data.counts.rejected} accent="text-danger" />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr><th className="py-1.5">Number</th><th>Date</th><th>Customer</th><th>Status</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r) => (
                <tr key={r.number}><td className="py-1.5">{r.number}</td><td>{r.date}</td><td>{r.customer}</td><td className="capitalize">{r.status}</td><td className="text-right">{r.total.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={`text-lg font-semibold ${accent ?? "text-ink"}`}>{value}</p>
    </div>
  );
}
