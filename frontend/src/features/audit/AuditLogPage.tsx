import { useEffect, useState } from "react";
import { downloadAuditLogCsv, listAuditLog, type AuditLogEntry } from "../../api/auditLog";

const PAGE_SIZE = 50;
const ENTITY_TYPES = [
  "customer", "service", "coupon", "business", "user", "feature_flag",
  "invoice", "payment", "quotation", "notification", "attendance",
];
const ACTIONS = ["login", "create", "update", "delete", "acknowledge", "convert"];

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const params = {
    search: search || undefined,
    entity_type: entityType || undefined,
    action: action || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  async function load() {
    setLoading(true);
    try {
      const res = await listAuditLog({ ...params, page, page_size: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, entityType, action, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [search, entityType, action, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Audit Log</h1>
        <button onClick={() => downloadAuditLogCsv(params)} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-white/5">
          Export CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description..."
          className="w-64 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" />
        <span className="self-center text-sm text-muted">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No matching entries.</td></tr>
            ) : (
              items.map((e) => (
                <tr key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="cursor-pointer hover:bg-white/5">
                  <td className="px-4 py-2 text-muted">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted">{e.user_name ?? "—"}</td>
                  <td className="px-4 py-2 capitalize text-muted">{e.action}</td>
                  <td className="px-4 py-2 text-muted">
                    {e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ""}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {expanded === e.id ? (
                      <div>
                        <p>{e.description}</p>
                        <p className="mt-1 text-xs text-muted">IP: {e.source_ip ?? "—"} · business_id: {e.business_id ?? "—"}</p>
                      </div>
                    ) : (
                      <span className="line-clamp-1">{e.description}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-line px-3 py-1 disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-line px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
