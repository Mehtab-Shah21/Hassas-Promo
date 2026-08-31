import { useCallback, useState } from "react";
import { downloadCsv, getCustomerStatement, type CustomerStatement } from "../../../api/reports";
import { listCustomers } from "../../../api/customers";
import type { Customer } from "../../../api/types";
import SearchCombobox from "../../../components/SearchCombobox";
import { ReportToolbar } from "../ReportToolbar";

export default function CustomerStatementTab() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [data, setData] = useState<CustomerStatement | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await listCustomers({ search: query || undefined, page: 1, page_size: 15 });
    return res.items;
  }, []);

  async function select(c: Customer) {
    setCustomer(c);
    setData(await getCustomerStatement(c.id));
  }

  return (
    <div>
      <div className="no-print mb-4 max-w-sm">
        {customer ? (
          <div className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
            <span>{customer.name}</span>
            <button onClick={() => { setCustomer(null); setData(null); }} className="text-xs text-muted hover:text-muted">change</button>
          </div>
        ) : (
          <SearchCombobox<Customer> placeholder="Search customer..." fetchOptions={fetchCustomers} getLabel={(c) => c.name} getSubLabel={(c) => c.phone} onSelect={select} />
        )}
      </div>

      {data && (
        <>
          <ReportToolbar showDates={false} onExportCsv={() => downloadCsv("/api/reports/customer-statement", { customer_id: data.customer_id }, `statement_${data.customer_id}.csv`)} />
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Stat label="Billed" value={data.billed_total} />
            <Stat label="Paid" value={data.paid_total} />
            <Stat label="Outstanding" value={data.outstanding_total} accent="text-danger" />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr><th className="py-1.5">Number</th><th>Date</th><th className="text-right">Billed</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r) => (
                <tr key={r.number}><td className="py-1.5">{r.number}</td><td>{r.date}</td><td className="text-right">{r.billed.toFixed(2)}</td><td className="text-right">{r.paid.toFixed(2)}</td><td className="text-right">{r.outstanding.toFixed(2)}</td></tr>
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
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={`text-xl font-semibold ${accent ?? "text-ink"}`}>{value.toFixed(2)}</p>
    </div>
  );
}
