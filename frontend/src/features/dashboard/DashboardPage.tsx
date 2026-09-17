import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CreditCard,
  FileText,
  LineChart,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getDashboardSummary } from "../../api/dashboard";
import type { DashboardSummary } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import { useFeatureFlags } from "../../context/FeatureFlagsContext";
import { isManagerOrAbove } from "../../utils/roles";
import { AttendanceTrendChart, RevenueTrendChart } from "./charts";

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const navigate = useNavigate();

  if (!isManagerOrAbove(user?.role)) {
    return <EmployeeDashboard />;
  }

  return <AdminDashboard businessId={activeBusiness?.id} businessName={activeBusiness?.name} navigate={navigate} />;
}

function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">Welcome, {user?.display_name ?? user?.username}</h1>
      <p className="mt-1 text-sm text-muted">Financial summaries are visible to admins only.</p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => navigate("/invoices/new")}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 transition-opacity"
        >
          + Create invoice
        </button>
        <button
          onClick={() => navigate("/customers")}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-wash-1"
        >
          + Add customer
        </button>
      </div>
    </div>
  );
}

function AdminDashboard({
  businessId,
  businessName,
  navigate,
}: {
  businessId: number | undefined;
  businessName: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { isEnabled } = useFeatureFlags();
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    getDashboardSummary(period)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [businessId, period]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-muted">{businessName}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/invoices/new")} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 transition-opacity">
            + Create invoice
          </button>
          <button onClick={() => navigate("/customers")} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-wash-1">
            + Add customer
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(["month", "year", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              period === p ? "bg-accent text-ink" : "border border-line text-muted hover:bg-wash-1"
            }`}
          >
            {p === "month" ? "This month" : p === "year" ? "This year" : "All time"}
          </button>
        ))}
      </div>

      {loading || !summary ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <>
          <SectionHeading icon={TrendingUp} title="Sales & revenue" />
          <div className="mb-6 grid grid-cols-3 gap-4">
            <KpiCard label="Total sales" value={summary.total_sales} sub={`${summary.invoice_count} invoices`} />
            <KpiCard label="Government fees paid to date" value={summary.govt_fees_paid_to_date} accent="text-orange-50" />
            <KpiCard label="VAT collected" value={summary.vat_collected} accent="text-accent-green" />
          </div>

          <SectionHeading icon={Wallet} title="Team & costs" />
          <div className="mb-6 grid grid-cols-3 gap-4">
            <KpiCard
              label="Active users"
              value={summary.active_users}
              decimals={0}
              onClick={() => navigate("/users")}
            />
            <KpiCard
              label="Total expenses"
              value={summary.total_expenses}
              accent="text-orange-50"
              onClick={() => navigate("/expenses")}
            />
            <KpiCard
              label="Net revenue"
              value={summary.net_revenue}
              sub="Sales − expenses, this period"
              accent={summary.net_revenue < 0 ? "text-danger" : "text-accent-green"}
            />
          </div>

          {isEnabled("reconciliation") && (
            <>
              <SectionHeading icon={CreditCard} title="Collections" />
              <div className="mb-6 grid grid-cols-2 gap-4">
                <KpiCard
                  label="Total collected"
                  value={summary.reconciliation_collected}
                  sub="Card & online payments"
                  accent="text-accent-green"
                  onClick={() => navigate("/reconciliation")}
                />
                <KpiCard
                  label="Still pending clearance"
                  value={summary.reconciliation_pending}
                  sub="All-time, card & online"
                  accent="text-orange-50"
                  onClick={() => navigate("/reconciliation")}
                />
              </div>
            </>
          )}

          <SectionHeading icon={LineChart} title="Revenue trend" sub="Last 6 months" />
          <div className="mb-6 rounded-lg border border-line bg-surface p-4">
            <RevenueTrendChart data={summary.sales_trend} />
          </div>

          <SectionHeading icon={CalendarCheck} title="Attendance" />
          <div className="mb-6 grid grid-cols-2 gap-6">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Today</h3>
              {summary.attendance_present_today === null ? (
                <p className="text-sm text-muted">Attendance module is off or not yet used today.</p>
              ) : (
                <p className="text-sm text-muted">
                  {summary.attendance_present_today} present · {summary.attendance_absent_today} absent
                </p>
              )}
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Last 7 days</h3>
              <AttendanceTrendChart data={summary.attendance_trend} />
            </div>
          </div>

          <SectionHeading icon={Receipt} title="Recent activity" />
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <FileText size={14} className="opacity-70" /> Recent invoices
              </h3>
              {summary.recent_invoices.length === 0 ? (
                <p className="text-sm text-muted">No invoices yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {summary.recent_invoices.map((inv) => (
                      <tr key={inv.id} className="cursor-pointer hover:bg-wash-1" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <td className="py-1.5 font-medium text-ink">{inv.number}</td>
                        <td className="py-1.5 text-muted">{inv.customer_name}</td>
                        <td className="py-1.5 text-muted">{inv.invoice_date}</td>
                        <td className="py-1.5 text-right text-muted">{inv.grand_total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Users size={14} className="opacity-70" /> Top customers
              </h3>
              {summary.top_customers.length === 0 ? (
                <p className="text-sm text-muted">No data yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {summary.top_customers.map((c) => (
                      <tr key={c.customer_id}>
                        <td className="py-1.5 font-medium text-ink">{c.customer_name}</td>
                        <td className="py-1.5 text-muted">{c.invoice_count} invoices</td>
                        <td className="py-1.5 text-right text-muted">{c.total_amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/20 text-accent">
        <Icon size={13} />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{title}</h2>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  onClick,
  decimals = 2,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
  onClick?: () => void;
  decimals?: number;
}) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={`text-2xl font-semibold ${accent ?? "text-ink"}`}>{value.toFixed(decimals)}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:bg-wash-1"
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-lg border border-line bg-surface p-4">{content}</div>;
}
