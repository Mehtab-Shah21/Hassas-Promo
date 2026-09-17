import { useEffect, useState } from "react";
import { downloadCsv, getExpensesReport, type ExpensesReport } from "../../../api/reports";
import type { ExpenseType } from "../../../api/types";
import { monthStart, ReportToolbar, today } from "../ReportToolbar";

const TYPE_LABELS: Record<ExpenseType, string> = {
  salary: "Salary",
  overhead: "Overhead",
  company_expense: "Company expense",
};

export default function ExpensesReportTab() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState<ExpensesReport | null>(null);

  useEffect(() => {
    getExpensesReport({ date_from: dateFrom, date_to: dateTo }).then(setData);
  }, [dateFrom, dateTo]);

  return (
    <div>
      <ReportToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onExportCsv={() => downloadCsv("/api/reports/expenses", { date_from: dateFrom, date_to: dateTo }, "expenses.csv")}
      />
      {data && (
        <>
          <div className="mb-4 grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs font-medium uppercase text-muted">Total expenses</p>
              <p className="text-2xl font-semibold text-danger">{data.total}</p>
            </div>
            {(Object.keys(TYPE_LABELS) as ExpenseType[]).map((t) => (
              <div key={t} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-xs font-medium uppercase text-muted">{TYPE_LABELS[t]}</p>
                <p className="text-xl font-semibold text-ink">{data.by_type[t] ?? "0.00"}</p>
              </div>
            ))}
          </div>
          {data.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No expenses recorded in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="py-1.5">Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Employee</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3">{r.date}</td>
                    <td className="whitespace-nowrap pr-3">{TYPE_LABELS[r.type]}</td>
                    {/* A report is read in full, so descriptions wrap rather than truncate. */}
                    <td className="max-w-md whitespace-pre-wrap break-words pr-3">{r.description || "—"}</td>
                    <td className="pr-3">{r.employee || "—"}</td>
                    <td className="whitespace-nowrap text-right">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
