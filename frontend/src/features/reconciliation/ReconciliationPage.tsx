import { useEffect, useState } from "react";
import {
  getReconciliation,
  markPaymentReceived,
} from "../../api/reconciliation";
import type {
  ReconciliationEntry,
  ReconciliationResponse,
} from "../../api/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-orange-50 text-white",
  received: "bg-accent-green text-white",
};

export default function ReconciliationPage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setData(await getReconciliation(date));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function handleMarkReceived(entry: ReconciliationEntry) {
    setMarkingId(entry.payment_id);
    try {
      await markPaymentReceived(entry.payment_id);
      await load();
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reconciliation</h1>
          <p className="text-sm text-muted">
            Card and online payments for the selected day — mark each as
            received once it's cleared into the account.
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted">
              Total collected
            </p>
            <p className="mt-1 text-2xl font-semibold text-accent-green">
              {data.total_collected.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted">
              Still pending clearance
            </p>
            <p className="mt-1 text-2xl font-semibold text-orange-50">
              {data.total_pending.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        {loading ?
          <p className="text-sm text-muted">Loading...</p>
        : !data || data.entries.length === 0 ?
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
            No card or online payments for this date.
          </p>
        : <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-1.5">Invoice</th>
                <th className="whitespace-nowrap px-4 py-1.5">Customer</th>
                <th className="whitespace-nowrap px-4 py-1.5">Method</th>
                <th className="whitespace-nowrap px-4 py-1.5 text-right">Amount</th>
                <th className="whitespace-nowrap px-4 py-1.5">Status</th>
                <th className="px-4 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.entries.map((e) => (
                <tr key={e.payment_id}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-ink">
                    {e.invoice_number}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{e.customer_name}</td>
                  <td className="whitespace-nowrap px-4 py-2 capitalize text-muted">
                    {e.payment_method}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-muted">
                    {e.amount.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[e.cleared_status]}`}>
                      {e.cleared_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {e.cleared_status === "pending" && (
                      <button
                        onClick={() => handleMarkReceived(e)}
                        disabled={markingId === e.payment_id}
                        className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                        {markingId === e.payment_id ?
                          "Marking..."
                        : "Mark received"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}
