import { useEffect, useState } from "react";
import { deleteExpense, listExpenses } from "../../api/expenses";
import { resolveAssetUrl } from "../../api/client";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";
import type { Expense, ExpenseType } from "../../api/types";
import ExpenseFormModal from "./ExpenseFormModal";

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<ExpenseType, string> = {
  salary: "Salary",
  overhead: "Overhead",
  company_expense: "Company expense",
};

const TYPE_STYLES: Record<ExpenseType, string> = {
  salary: "bg-link/10 text-link",
  overhead: "bg-orange-50/10 text-orange-50",
  company_expense: "bg-accent-green/10 text-accent-green",
};

export default function ExpensesPage() {
  const { activeBusiness } = useBusiness();
  const currency = currencyLabel(activeBusiness);

  const [items, setItems] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState("0.00");
  const [page, setPage] = useState(1);
  const [type, setType] = useState<ExpenseType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listExpenses({
        type,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalAmount(res.total_amount);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeBusiness) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id, page, type, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [type, dateFrom, dateTo, activeBusiness?.id]);

  async function handleDelete(expense: Expense) {
    if (!confirm(`Delete this ${TYPE_LABELS[expense.type].toLowerCase()} expense of ${currency} ${expense.amount}?`)) return;
    await deleteExpense(expense.id);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Expenses</h1>
          <p className="text-sm text-muted">{activeBusiness?.name}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 transition-opacity"
        >
          + Add expense
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase text-muted">Total (matching filters below)</p>
        <p className="mt-1 text-2xl font-semibold text-ink">
          {currency} {totalAmount}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ExpenseType | "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All types</option>
          <option value="salary">Salary</option>
          <option value="overhead">Overhead</option>
          <option value="company_expense">Company expense</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <span className="self-center text-sm text-muted">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        {(type || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setType("");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-sm text-link hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-wash-1 text-left text-xs font-semibold uppercase text-ink">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No expenses recorded for this filter.
                </td>
              </tr>
            ) : (
              items.map((exp) => (
                <tr key={exp.id} className="hover:bg-wash-1">
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{exp.date}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[exp.type]}`}>
                      {TYPE_LABELS[exp.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{exp.description ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{exp.employee_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-ink">
                    {currency} {exp.amount}
                  </td>
                  <td className="px-4 py-2">
                    {exp.attachment_path && (
                      <a
                        href={resolveAssetUrl(exp.attachment_path) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-link hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditing(exp)} className="mr-3 text-link hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(exp)} className="text-danger hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <ExpenseFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editing && (
        <ExpenseFormModal
          expense={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
