import type { UserRole } from "../api/types";

// Superadmin is a superset of admin everywhere except the Users module's
// own finer-grained matrix (see UsersPage.tsx/UserFormModal.tsx), which
// checks the exact role directly.
export function isAdminOrAbove(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

// Superadmin is the only role not locked to a single company — it owns the
// business switcher and can act on either. See BusinessContext/AppShell.
export function isSuperadmin(role: UserRole | null | undefined): boolean {
  return role === "superadmin";
}
