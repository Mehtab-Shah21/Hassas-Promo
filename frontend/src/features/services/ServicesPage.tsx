import { useEffect, useState } from "react";
import { listServiceCategories, listServices } from "../../api/services";
import type { Service, ServiceCategory } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import CategoriesModal from "./CategoriesModal";
import ServiceFormModal from "./ServiceFormModal";

export default function ServicesPage() {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const isAdmin = user?.role === "admin";

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  async function loadCategories() {
    setCategories(await listServiceCategories());
  }

  async function loadServices() {
    setLoading(true);
    try {
      const res = await listServices({
        search: search || undefined,
        category_id: categoryId || undefined,
        active_only: true,
        page: 1,
        page_size: 200,
      });
      setServices(res.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeBusiness) return;
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id]);

  useEffect(() => {
    if (!activeBusiness) return;
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id, search, categoryId]);

  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Services</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCategories(true)}
              className="rounded-md border border-line px-3 py-2 text-sm hover:bg-white/5"
            >
              Manage categories
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              + Add service
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <p className="mb-4 rounded-md bg-white/10 px-3 py-2 text-xs text-muted">
          You have read-only access to services. Ask an admin to add or edit them.
        </p>
      )}

      <div className="mb-4 flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className="w-72 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Govt. fee</th>
              <th className="px-4 py-2">Taxable</th>
              {isAdmin && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Loading...
                </td>
              </tr>
            ) : services.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No services yet.
                </td>
              </tr>
            ) : (
              services.map((s) => (
                <tr key={s.id} className="hover:bg-white/5">
                  <td className="px-4 py-2 font-medium text-ink">
                    {s.name}
                    {s.code && <span className="ml-2 text-xs text-muted">{s.code}</span>}
                  </td>
                  <td className="px-4 py-2 text-muted">{categoryName(s.category_id)}</td>
                  <td className="px-4 py-2 text-muted">{s.price.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted">{s.govt_fee.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted">{s.taxable ? "Yes" : "No"}</td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setEditingService(s)} className="text-accent hover:underline">
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ServiceFormModal
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadServices();
          }}
        />
      )}
      {editingService && (
        <ServiceFormModal
          service={editingService}
          categories={categories}
          onClose={() => setEditingService(null)}
          onSaved={() => {
            setEditingService(null);
            loadServices();
          }}
        />
      )}
      {showCategories && (
        <CategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={() => {
            loadCategories();
            loadServices();
          }}
        />
      )}
    </div>
  );
}
