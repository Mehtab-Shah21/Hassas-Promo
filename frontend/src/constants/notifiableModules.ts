export interface NotifiableModule {
  to: string;
  label: string;
}

// Shared between the notification form's "Visible on" checklist and the
// nav's red-dot lookup, so both always agree on the same module set/keys.
// Keyed by route path (matches AppShell's NAV_ITEMS `to`). Notifications
// itself is excluded — its own bell/badge already covers that case.
export const NOTIFIABLE_MODULES: NotifiableModule[] = [
  { to: "/", label: "Dashboard" },
  { to: "/customers", label: "Customers" },
  { to: "/services", label: "Services" },
  { to: "/invoices", label: "Invoices" },
  { to: "/quotations", label: "Quotations" },
  { to: "/coupons", label: "Coupons" },
  { to: "/attendance", label: "Attendance" },
  { to: "/reports", label: "Reports" },
  { to: "/audit-log", label: "Audit Log" },
  { to: "/design-studio", label: "Design Studio" },
  { to: "/settings", label: "Settings" },
];
