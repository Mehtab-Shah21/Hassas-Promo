import { useEffect, useState } from "react";
import { downloadCsv, getSalesByInvoice, getSalesByService, getSalesSummary } from "../../../api/reports";
import type { SalesByInvoiceRow, SalesByServiceRow, SalesSummary } from "../../../api/reports";
import { monthStart, ReportToolbar, today } from "../ReportToolbar";

export default function SalesReportTab() {
  const [subView, setSubView] = useState<"summary" | "by_invoice" | "by_service">("summary");
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [byInvoice, setByInvoice] = useState<SalesByInvoiceRow[]>([]);
  const [byService, setByService] = useState<SalesByServiceRow[]>([]);

  useEffect(() => {
    const range = { date_from: dateFrom, date_to: dateTo };
    getSalesSummary(range).then(setSummary);
    getSalesByInvoice(range).then(setByInvoice);
    getSalesByService(range).then(setByService);
  }, [dateFrom, dateTo]);

  function exportCsv() {
    if (subView === "summary") return;
    downloadCsv("/api/reports/sales", { view: subView, date_from: dateFrom, date_to: dateTo }, `sales_${subView}.csv`);
  }

  return (
    <div>
      <div className="no-print mb-3 flex gap-2">
        {(["summary", "by_invoice", "by_service"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${subView === v ? "bg-accent text-white" : "border border-line text-muted"}`}
          >
            {v === "summary" ? "Summary" : v === "by_invoice" ? "By Invoice" : "By Service"}
          </button>
        ))}
      </div>
      <ReportToolbar dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} onExportCsv={exportCsv} />

      {subView === "summary" && summary && (
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Invoices" value={summary.invoice_count} />
          <Stat label="Total sales" value={summary.total_sales.toFixed(2)} />
          <Stat label="VAT" value={summary.total_vat.toFixed(2)} />
          <Stat label="Govt fees" value={summary.total_govt_fee.toFixed(2)} />
        </div>
      )}

      {subView === "by_invoice" && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-muted">
            <tr><th className="py-1.5">Number</th><th>Date</th><th>Customer</th><th>Type</th><th>Status</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {byInvoice.map((r) => (
              <tr key={r.number}><td className="py-1.5">{r.number}</td><td>{r.date}</td><td>{r.customer}</td><td className="capitalize">{r.type}</td><td className="capitalize">{r.status}</td><td className="text-right">{r.total.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {subView === "by_service" && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-muted">
            <tr><th className="py-1.5">Service</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {byService.map((r) => (
              <tr key={r.service}><td className="py-1.5">{r.service}</td><td className="text-right">{r.qty}</td><td className="text-right">{r.revenue.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}
