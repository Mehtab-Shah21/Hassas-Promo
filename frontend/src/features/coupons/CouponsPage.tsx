import { useEffect, useState } from "react";
import { deactivateCoupon, listCoupons } from "../../api/coupons";
import type { Coupon } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import CouponFormModal from "./CouponFormModal";

export default function CouponsPage() {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const isAdmin = user?.role === "admin";

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  async function load() {
    setLoading(true);
    try {
      setCoupons(await listCoupons(false));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeBusiness) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id]);

  async function handleDeactivate(c: Coupon) {
    if (!confirm(`Deactivate coupon ${c.code}?`)) return;
    await deactivateCoupon(c.id);
    load();
  }

  function isCurrentlyValid(c: Coupon) {
    const today = new Date().toISOString().slice(0, 10);
    if (!c.is_active) return false;
    if (c.valid_from && c.valid_from > today) return false;
    if (c.valid_to && c.valid_to < today) return false;
    return true;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Coupons</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            + Add coupon
          </button>
        )}
      </div>

      {!isAdmin && (
        <p className="mb-4 rounded-md bg-white/10 px-3 py-2 text-xs text-muted">
          You have read-only access to coupons. They're available to apply when invoicing.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Discount</th>
              <th className="px-4 py-2">Valid from</th>
              <th className="px-4 py-2">Valid to</th>
              <th className="px-4 py-2">Status</th>
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
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No coupons yet.
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} className="hover:bg-white/5">
                  <td className="px-4 py-2 font-medium text-ink">{c.code}</td>
                  <td className="px-4 py-2 text-muted">
                    {c.discount_type === "percent" ? `${c.value}%` : c.value.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-muted">{c.valid_from ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{c.valid_to ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isCurrentlyValid(c) ? "bg-accent-green/10 text-accent-green" : "bg-white/10 text-muted"
                      }`}
                    >
                      {isCurrentlyValid(c) ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setEditing(c)} className="mr-3 text-accent hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDeactivate(c)} className="text-danger hover:underline">
                        Deactivate
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
        <CouponFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {editing && (
        <CouponFormModal
          coupon={editing}
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
