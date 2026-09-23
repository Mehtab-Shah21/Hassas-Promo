import { useEffect, useState } from "react";
import { deactivateUser, listUsers } from "../../api/users";
import type { AppUser } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import PasswordModal from "./PasswordModal";
import UserFormModal from "./UserFormModal";

const ROLE_STYLES: Record<string, string> = {
  superadmin: "bg-link/20 text-link",
  admin: "bg-orange-50/20 text-orange-50",
  manager: "bg-accent-green/20 text-accent-green",
  employee: "bg-wash-2 text-muted",
};

// Target roles only a superadmin (or the system owner) may manage — manager
// is deliberately excluded, so a plain admin can create/edit/reset-password/
// deactivate manager accounts too. Mirrors the backend's ELEVATED_ROLES in
// routers/users.py exactly; keep the two in step.
const ELEVATED = new Set(["admin", "superadmin"]);

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { businesses } = useBusiness();
  const isSuperadmin = currentUser?.role === "superadmin";
  const isOwner = !!currentUser?.is_system_owner;
  const businessName = (id: number | null) => businesses.find((b) => b.id === id)?.name ?? "—";

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [changingOwn, setChangingOwn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  // Mirrors the server-side matrix in routers/users.py: the system owner
  // manages everyone; a superadmin manages admins and employees but not other
  // superadmins; a plain admin only employees. Nobody manages their own row
  // here — their own password is "Change password".
  function canManage(u: AppUser) {
    if (u.id === currentUser?.id) return false;
    if (isOwner) return true;
    if (u.is_system_owner) return false;
    if (isSuperadmin) return u.role !== "superadmin";
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
            {isOwner
              ? "System owner: manage every login, including creating superadmins and resetting their passwords."
              : isSuperadmin
                ? "Manage login accounts and reset forgotten passwords. Staff records live in Employees — a login can be linked to one there."
                : "Manage manager/employee logins for your company. Only a superadmin can manage admin accounts. Staff records live in Employees."}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 transition-opacity"
        >
          + Add user
        </button>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-2 text-sm text-accent-green">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-wash-1 text-left text-xs font-semibold uppercase text-ink">
            <tr>
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2">Role</th>
              {isSuperadmin && <th className="px-4 py-2">Company</th>}
              <th className="px-4 py-2">Linked</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={isSuperadmin ? 6 : 5} className="px-4 py-8 text-center text-muted">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={isSuperadmin ? 6 : 5} className="px-4 py-8 text-center text-muted">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-wash-1">
                  <td className="px-4 py-2 font-medium text-ink">
                    {u.username}
                    {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted">(you)</span>}
                    {u.is_system_owner && (
                      <span className="ml-2 rounded-full bg-link/20 px-2 py-0.5 text-xs font-medium text-link">System owner</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  {isSuperadmin && (
                    <td className="px-4 py-2 text-muted">{u.role === "superadmin" ? "All" : businessName(u.business_id)}</td>
                  )}
                  <td className="px-4 py-2 text-muted">{u.employee_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active ? "bg-accent-green/20 text-accent-green" : "bg-wash-2 text-muted"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {u.id === currentUser?.id && (
                      <button onClick={() => setChangingOwn(true)} className="text-link hover:underline">
                        Change password
                      </button>
                    )}
                    {canManage(u) && (
                      <>
                        <button onClick={() => setEditing(u)} className="mr-3 text-link hover:underline">
                          Edit
                        </button>
                        <button onClick={() => setResetting(u)} className="mr-3 text-link hover:underline">
                          Reset password
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
      {resetting && (
        <PasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setNotice(`Password reset for ${resetting.username}.`);
            setResetting(null);
          }}
        />
      )}
      {changingOwn && (
        <PasswordModal
          onClose={() => setChangingOwn(false)}
          onDone={() => {
            setNotice("Your password has been changed.");
            setChangingOwn(false);
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
