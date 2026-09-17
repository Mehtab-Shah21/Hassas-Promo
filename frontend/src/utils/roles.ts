import type { UserRole } from "../api/types";

// Rank: employee < manager < admin < superadmin.
const RANK: Record<UserRole, number> = { employee: 0, manager: 1, admin: 2, superadmin: 3 };

// Superadmin is a superset of admin everywhere except the Users module's
// own finer-grained matrix (see UsersPage.tsx/UserFormModal.tsx), which
// checks the exact role directly.
export function isAdminOrAbove(role: UserRole | null | undefined): boolean {
  return !!role && RANK[role] >= RANK.admin;
}

// The operational tier: full day-to-day access (customers, services,
// coupons, invoicing, expenses, attendance, reconciliation, reports,
// dashboard) without account administration or system configuration — see
// the backend's core/deps.MANAGER_ROLES, which this mirrors exactly.
export function isManagerOrAbove(role: UserRole | null | undefined): boolean {
  return !!role && RANK[role] >= RANK.manager;
}

// Superadmin is the only role not locked to a single company — it owns the
// business switcher and can act on either. See BusinessContext/AppShell.
export function isSuperadmin(role: UserRole | null | undefined): boolean {
  return role === "superadmin";
}
