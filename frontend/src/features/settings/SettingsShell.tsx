import { NavLink, Outlet } from "react-router-dom";

const SETTINGS_NAV = [
  { to: "", label: "Company Profile", end: true },
  { to: "regional", label: "Regional" },
  { to: "invoice-defaults", label: "Invoice Defaults" },
  { to: "quotation-defaults", label: "Quotation Defaults" },
  { to: "features", label: "Modules & Features" },
  { to: "security", label: "Security" },
  { to: "backup", label: "Backup & Restore" },
];

export default function SettingsShell() {
  return (
    <div className="flex gap-6">
      <nav className="w-52 shrink-0 space-y-1">
        {SETTINGS_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium ${
                isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-white/5"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-6">
        <Outlet />
      </div>
    </div>
  );
}
