import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Briefcase,
  FileText,
  FileClock,
  Ticket,
  Bell,
  CalendarCheck,
  Landmark,
  BarChart3,
  ScrollText,
  Palette,
  Receipt,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { resolveAssetUrl } from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import { acknowledgeNotification, snoozeNotification } from "../api/notifications";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useFeatureFlags } from "../context/FeatureFlagsContext";
import { useNotifications } from "../context/NotificationsContext";
import { currencyLabel } from "../utils/currency";
import { DeductionActions, deductionWorking, monthYear, shortDate } from "../features/employees/DeductionControls";
import type { SalaryAlert } from "../api/types";
import { isAdminOrAbove, isManagerOrAbove, isSuperadmin } from "../utils/roles";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Omitted: visible to everyone (employee and up). "manager": operational
  // tier (attendance, reconciliation, reports, expenses, audit log).
  // "admin": account/system administration (design studio, users, settings).
  minRole?: "manager" | "admin";
  flag?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/services", label: "Services", icon: Briefcase },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/quotations", label: "Quotations", icon: FileClock, flag: "quotations" },
  { to: "/coupons", label: "Coupons", icon: Ticket, flag: "coupons" },
  { to: "/notifications", label: "Notifications", icon: Bell, flag: "notifications" },
  { to: "/employees", label: "Employees", icon: CalendarCheck, minRole: "manager", flag: "attendance" },
  { to: "/reconciliation", label: "Reconciliation", icon: Landmark, minRole: "manager", flag: "reconciliation" },
  { to: "/reports", label: "Reports", icon: BarChart3, minRole: "manager", flag: "reports" },
  { to: "/expenses", label: "Expenses", icon: Receipt, minRole: "manager" },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText, minRole: "manager" },
  { to: "/design-studio", label: "Design Studio", icon: Palette, minRole: "admin", flag: "design_studio" },
  { to: "/users", label: "Users", icon: UserCog, minRole: "admin" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, minRole: "admin" },
];

const SIDEBAR_STORAGE_KEY = "sidebar_collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * A salary that has reached its pay date, in the bell. The absence deduction
 * (if any) is decided right here -- confirmed or waived -- and the alert stays
 * until the salary is marked paid.
 */
function SalaryAlertItem({
  alert,
  onChanged,
  onOpenExpenses,
}: {
  alert: SalaryAlert;
  onChanged: () => void;
  onOpenExpenses: () => void;
}) {
  const { activeBusiness } = useBusiness();
  const currency = currencyLabel(activeBusiness);
  const d = alert.deduction;
  const due =
    alert.days_since_pay_date <= 0
      ? "due today"
      : `due ${alert.days_since_pay_date} day${alert.days_since_pay_date === 1 ? "" : "s"} ago`;

  return (
    <div className="border-b border-line px-3 py-2 last:border-b-0">
      <p className="text-sm font-medium text-ink">
        {alert.employee_name}{" "}
        <span className="rounded-full bg-link/15 px-1.5 py-0.5 text-[10px] font-medium text-link">Salary</span>
      </p>
      <p className="text-xs text-muted">
        {monthYear(d.period_start)} · pay date {shortDate(alert.pay_date)} · {due}
      </p>

      {d.status === "none" && (
        <p className="mt-1 text-xs text-muted">
          No absences — {currency} {d.gross_amount.toFixed(2)} is ready to pay.
        </p>
      )}
      {d.status === "pending" && (
        <div className="mt-1 text-xs text-muted">
          <p>{deductionWorking(d, currency)}</p>
          <p className="font-medium text-ink">
            Deduct {currency} {d.amount.toFixed(2)} → pay {currency} {d.net_amount.toFixed(2)}
          </p>
        </div>
      )}
      {d.status === "confirmed" && (
        <p className="mt-1 text-xs text-muted">
          Deduction of {currency} {d.amount.toFixed(2)} confirmed — pay {currency} {d.net_amount.toFixed(2)}.
        </p>
      )}
      {d.status === "waived" && (
        <p className="mt-1 text-xs text-muted">
          Deduction waived — pay {currency} {d.net_amount.toFixed(2)}.
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-start gap-2">
        <DeductionActions expenseId={alert.expense_id} deduction={d} isPaid={false} onChanged={onChanged} />
        {d.status !== "pending" && (
          <button
            type="button"
            onClick={onOpenExpenses}
            className="rounded-md border border-line px-2 py-1 text-xs hover:bg-wash-1"
          >
            Go to Expenses
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const { activeNotifications, salaryAlerts, bellCount, refresh } = useNotifications();
  const { isEnabled } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleAcknowledge(id: number) {
    await acknowledgeNotification(id);
    refresh();
  }
  async function handleSnooze(id: number) {
    await snoozeNotification(id, 3);
    refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          // a pay date may have arrived since the last check
          if (!open) refresh();
          setOpen((o) => !o);
        }}
        aria-label="Notifications"
        title="Notifications"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-wash-1 hover:text-ink"
      >
        <Bell size={16} />
        {bellCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-bg">
            {bellCount > 9 ? "9+" : bellCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-md border border-line bg-surface shadow-floating">
          <div className="border-b border-line px-3 py-2 text-sm font-semibold text-ink">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {salaryAlerts.map((alert) => (
              <SalaryAlertItem
                key={`salary-${alert.expense_id}`}
                alert={alert}
                onChanged={refresh}
                onOpenExpenses={() => {
                  setOpen(false);
                  navigate("/expenses");
                }}
              />
            ))}
            {activeNotifications.length === 0 && salaryAlerts.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">Nothing active right now.</p>
            ) : (
              activeNotifications.map((n) => (
                <div key={n.id} className="border-b border-line px-3 py-2 last:border-b-0">
                  <p className="text-sm font-medium text-ink">
                    {n.customer_name} <span className="font-normal text-muted">· {n.service_name}</span>
                  </p>
                  {n.note && <p className="text-xs text-muted">{n.note}</p>}
                  <p className="text-xs text-muted">
                    Target: {n.target_date} ·{" "}
                    {n.days_remaining < 0 ? `${-n.days_remaining} days overdue` : `${n.days_remaining} days remaining`}
                  </p>
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <button onClick={() => handleSnooze(n.id)} className="rounded-md border border-line px-2 py-1 hover:bg-wash-1">
                      Snooze 3d
                    </button>
                    <button
                      onClick={() => handleAcknowledge(n.id)}
                      className="rounded-md bg-accent px-2 py-1 text-ink hover:opacity-90 transition-opacity"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {isEnabled("notifications") && (
            <button
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="block w-full border-t border-line px-3 py-2 text-center text-sm font-medium text-link hover:bg-wash-1"
            >
              View all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { businesses, activeBusiness, setActiveBusinessId } = useBusiness();
  const { isEnabled } = useFeatureFlags();
  const { badgeCount } = useNotifications();
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed());

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable (private browsing etc.) — preference just won't persist
    }
  }, [collapsed]);

  // Superadmin spans every company and owns the switcher; a non-superadmin
  // has exactly one company in `businesses` already (the server itself
  // only ever returns their own — see routers/businesses.py), so there is
  // nothing to filter for them either. Both companies always appear: the
  // install-wide switch that used to hide IIM was removed, since turning a
  // whole company off from a settings page is too destructive to sit behind
  // a single toggle.
  const visibleBusinesses = businesses;
  const visibleItems = NAV_ITEMS.filter(
    (item) => {
      const roleOk =
        !item.minRole ||
        (item.minRole === "admin" ? isAdminOrAbove(user?.role) : isManagerOrAbove(user?.role));
      return roleOk && (!item.flag || isEnabled(item.flag));
    },
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <aside
        className={`no-print flex shrink-0 flex-col border-r border-line bg-bg text-muted transition-all duration-200 ease-in-out ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`flex items-center border-b border-line ${collapsed ? "justify-center py-4" : "justify-between px-5 py-5"}`}>
          {!collapsed && (
            <span className="flex min-w-0 items-center gap-2">
              {activeBusiness?.logo_path && (
                <img
                  src={resolveAssetUrl(activeBusiness.logo_path)!}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-contain"
                />
              )}
              <span className="truncate text-lg font-semibold text-ink">
                {activeBusiness?.name ?? "PRO Invoicing"}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-wash-1 hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `group relative flex items-center rounded-md text-sm font-medium transition-colors ${
                    collapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-2"
                  } ${isActive ? "bg-accent text-ink" : "text-muted hover:bg-wash-1 hover:text-ink"}`
                }
              >
                <span className={`flex min-w-0 items-center ${collapsed ? "" : "gap-2"}`}>
                  <span className="relative flex shrink-0 items-center justify-center">
                    <Icon size={18} />
                    {collapsed && item.to === "/notifications" && badgeCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-bg">
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && item.to === "/notifications" && badgeCount > 0 && (
                  <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold text-bg">
                    {badgeCount}
                  </span>
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-floating transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-line p-3 text-xs text-muted">
          {!collapsed && (
            <>
              <div>v0.1 — foundation</div>
              <div>MS Software Solutions</div>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted">Business:</span>
            {isSuperadmin(user?.role) ? (
              <select
                value={activeBusiness?.id ?? ""}
                onChange={(e) => setActiveBusinessId(Number(e.target.value))}
                className="rounded-md border border-line bg-surface px-2 py-1 text-sm font-medium text-ink focus:border-accent focus:outline-none"
              >
                {visibleBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              // No switcher for a non-superadmin — they belong to exactly
              // one company and must not even know another one exists.
              <span className="text-sm font-medium text-ink">{activeBusiness?.name ?? "—"}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(isEnabled("notifications") || isEnabled("attendance")) && <NotificationBell />}
            <ThemeToggle />
            <span className="rounded-full bg-beige px-2 py-0.5 text-xs font-medium capitalize text-beige-ink">
              {user?.role}
            </span>
            <button onClick={logout} className="text-sm text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-bg p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
