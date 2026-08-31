import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCustomers } from "../../api/customers";
import type { Customer, CustomerType } from "../../api/types";
import { useBusiness } from "../../context/BusinessContext";
import CustomerFormModal from "./CustomerFormModal";

const PAGE_SIZE = 20;

export default function CustomersListPage() {
  const { activeBusiness } = useBusiness();
  const navigate = useNavigate();
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<CustomerType | "">("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listCustomers({
        search: search || undefined,
        type: type || undefined,
        include_employees: false,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeBusiness) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id, page, search, type]);

  useEffect(() => {
    setPage(1);
  }, [search, type, activeBusiness?.id]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Customers</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          + Add customer
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or tax ID..."
          className="w-72 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomerType | "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All types</option>
          <option value="individual">Individual</option>
          <option value="company">Company</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-wash-1 text-left text-xs font-semibold uppercase text-ink">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Tax / ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No customers yet. Click "Add customer" to create one.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="cursor-pointer hover:bg-wash-1"
                >
                  <td className="px-4 py-2 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-2 capitalize text-muted">{c.type}</td>
                  <td className="px-4 py-2 text-muted">
                    {c.phone_code} {c.phone}
                  </td>
                  <td className="px-4 py-2 text-muted">{c.email}</td>
                  <td className="px-4 py-2 text-muted">{c.id_value}</td>
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
        <CustomerFormModal
          onClose={() => setShowAdd(false)}
          onSaved={(c) => {
            setShowAdd(false);
            navigate(`/customers/${c.id}`);
          }}
        />
      )}
    </div>
  );
}
