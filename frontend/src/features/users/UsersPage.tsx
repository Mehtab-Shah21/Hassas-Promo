import { useEffect, useState } from "react";
import { deactivateUser, listUsers } from "../../api/users";
import type { AppUser } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import UserFormModal from "./UserFormModal";

const ROLE_STYLES: Record<string, string> = {
  superadmin: "bg-link/10 text-link",
  admin: "bg-orange-50/10 text-orange-50",
  employee: "bg-wash-2 text-muted",
};

const ELEVATED = new Set(["admin", "superadmin"]);

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isSuperadmin = currentUser?.role === "superadmin";

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  async function load() {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Mirrors the server-side matrix in routers/users.py: a plain admin can
  // only manage employee-role accounts, and never their own row.
  function canManage(u: AppUser) {
    if (u.id === currentUser?.id) return false;
    if (isSuperadmin) return true;
    return !ELEVATED.has(u.role);
  }

  async function handleDeactivate(u: AppUser) {
    if (!confirm(`Deactivate ${u.username}? They won't be able to sign in.`)) return;
    await deactivateUser(u.id);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Users</h1>
          <p className="text-sm text-muted">
            {isSuperadmin
              ? "Manage every account, including other admins and superadmins."
              : "You can create and manage employee accounts. Only a superadmin can manage admin or superadmin accounts."}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 transition-opacity"
        >
          + Add user
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-wash-1 text-left text-xs font-semibold uppercase text-ink">
            <tr>
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Linked employee</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-wash-1">
                  <td className="px-4 py-2 font-medium text-ink">
                    {u.username}
                    {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted">(you)</span>}
                  </td>
                  <td className="px-4 py-2 text-muted">{u.display_name ?? `${u.first_name} ${u.last_name ?? ""}`.trim()}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{u.employee_id ? `#${u.employee_id}` : "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active ? "bg-accent-green/10 text-accent-green" : "bg-wash-2 text-muted"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canManage(u) && (
                      <>
                        <button onClick={() => setEditing(u)} className="mr-3 text-link hover:underline">
                          Edit
                        </button>
                        {u.is_active && (
                          <button onClick={() => handleDeactivate(u)} className="text-danger hover:underline">
                            Deactivate
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <UserFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editing && (
        <UserFormModal
          targetUser={editing}
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
