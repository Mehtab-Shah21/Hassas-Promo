import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { isAdminOrAbove, isManagerOrAbove } from "../utils/roles";
import PlaceholderPage from "./PlaceholderPage";

/**
 * Route guard. Defaults to admin-or-above; pass minRole="manager" for the
 * operational-tier pages (attendance, reconciliation, reports, expenses,
 * audit log) that a manager should also reach. Mirrors the sidebar's own
 * NAV_ITEMS.minRole in AppShell.tsx and the backend's require_admin /
 * require_manager split — this is defense in depth (the server enforces the
 * real boundary), not the source of truth.
 */
export default function AdminOnlyRoute({
  children,
  minRole = "admin",
}: {
  children: ReactNode;
  minRole?: "manager" | "admin";
}) {
  const { user } = useAuth();
  const allowed = minRole === "manager" ? isManagerOrAbove(user?.role) : isAdminOrAbove(user?.role);
  if (!allowed) {
    return <PlaceholderPage title={minRole === "manager" ? "Managers and above only" : "Admins only"} />;
  }
  return <>{children}</>;
}
