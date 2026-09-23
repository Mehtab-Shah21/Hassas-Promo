import { useEffect, useState, type FormEvent } from "react";
import { Building2, KeyRound, Link2, ShieldCheck, User as UserIcon } from "lucide-react";
import { createUser, listUsers, updateUser, type UserPayload } from "../../api/users";
import { listEmployees } from "../../api/employees";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import { Field, ModalFooter, Select, TextInput } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { AppUser, Employee, UserRole } from "../../api/types";
import { getErrorMessage } from "../../utils/errors";

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];

/**
 * Logins only. Staff records are created and managed in Employees — this
 * form can link a login to someone who already exists there, but never adds
 * a person, so there is exactly one place a person joins the business and no
 * way to end up with the same human in the system twice.
 */
export default function UserFormModal({
  targetUser,
  onClose,
  onSaved,
}: {
  targetUser?: AppUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: currentUser } = useAuth();
  const { activeBusiness } = useBusiness();
  const isEdit = !!targetUser;
  // Which roles this form offers mirrors the server (routers/users.py): only
  // the system owner can make a superadmin, a superadmin can make admins, and
  // a plain admin can make manager or employee accounts (but not admin or
  // above). This just keeps the form honest about what will actually save.
  const canGrantElevated = currentUser?.role === "superadmin";
  const assignableRoles = currentUser?.is_system_owner
    ? ALL_ROLES
    : canGrantElevated
      ? ALL_ROLES.filter((r) => r.value !== "superadmin")
      : ALL_ROLES.filter((r) => r.value === "employee" || r.value === "manager");

  // A login is just a username, a role and (optionally) the staff record it
  // belongs to. The person's name, email and phone live on that staff record,
  // so they are not asked for here.
  const [form, setForm] = useState<UserPayload>(
    targetUser
      ? { username: targetUser.username, role: targetUser.role, employee_id: targetUser.employee_id }
      : { username: "", role: "employee", employee_id: null },
  );
  const [password, setPassword] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [linkedElsewhere, setLinkedElsewhere] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adding: the new account belongs to whichever business is currently
  // active (same as the backend resolves it). Editing: an existing
  // account's own business — a superadmin can browse/edit a user from
  // EITHER company regardless of which one is currently active, so the
  // employee roster offered here must follow the target account, not the
  // switcher, or it'd offer the wrong company's staff to link.
  const employeeScopeBusinessId = isEdit ? targetUser?.business_id ?? undefined : activeBusiness?.id;

  // Only offer employees nobody else already has a login through —
  // otherwise picking one just bounces back from the server with "already
  // linked".
  useEffect(() => {
    Promise.all([listEmployees(false, employeeScopeBusinessId), listUsers()])
      .then(([emps, users]) => {
        setEmployees(emps);
        setLinkedElsewhere(
          new Set(
            users
              .filter((u) => u.employee_id != null && u.id !== targetUser?.id)
              .map((u) => u.employee_id as number),
          ),
        );
      })
      .catch(() => {
        // The employees endpoint 403s when the Employees module is off for
        // this business — that's fine, it just means there's no roster to
        // offer for linking; a login can still be created without one.
        setEmployees([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only staff who are still here can be given a login. (The person an
  // existing login is already linked to is added back below, so editing
  // someone linked to a since-deactivated employee doesn't lose the link.)
  const availableEmployees = employees.filter((e) => e.is_active && !linkedElsewhere.has(e.id));
  const linkableEmployees =
    isEdit && targetUser?.employee_id
      ? [...availableEmployees, ...employees.filter((emp) => emp.id === targetUser.employee_id)]
      : availableEmployees;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !password) {
      setError("Set a password for this account.");
      return;
    }

    setSaving(true);
    try {
      // Names are derived server-side from the linked employee (or the
      // username), so nothing name-shaped is sent.
      const payload: UserPayload = {
        username: form.username,
        role: form.role,
        employee_id: form.employee_id ?? null,
      };
      if (password) payload.password = password;

      await (isEdit ? updateUser(targetUser!.id, payload) : createUser(payload));
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save user."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit user" : "Add user"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {!isEdit && (
            <p className="rounded-md bg-wash-1 p-3 text-xs text-muted">
              This creates a <span className="font-medium text-ink">login</span>. Staff records live in{" "}
              <span className="font-medium text-ink">Employees</span> — link this login to one below if the person
              is already on the roster.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" icon={UserIcon}>
              <TextInput
                value={form.username ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                required
                maxLength={50}
              />
            </Field>
            <Field label="Role" icon={ShieldCheck}>
              <Select
                value={form.role ?? "employee"}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                disabled={!canGrantElevated}
              >
                {assignableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {canGrantElevated && form.role !== "superadmin" && (!isEdit || targetUser?.role === "superadmin") && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Building2 size={13} className="opacity-70" />
              Company: <span className="font-medium text-ink">{activeBusiness?.name ?? "—"}</span> (the currently
              active business — switch it above to {isEdit ? "assign" : "add"} this account under a different
              company)
            </p>
          )}

          <Field label="Linked employee" hint="(optional — for attendance and salary)" icon={Link2}>
            <Select
              value={form.employee_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Not linked to a staff record</option>
              {linkableEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* Only when creating. An existing account's password is changed
              with "Reset password" on the Users list, which has its own
              confirmation and permission check. */}
          {!isEdit && (
            <Field label="Password" icon={KeyRound}>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isEdit ? "Save changes" : "Create account"} />
      </form>
    </Modal>
  );
}
