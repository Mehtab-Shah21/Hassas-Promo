import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Link2, Mail, Phone, ShieldCheck, User as UserIcon } from "lucide-react";
import { createUser, updateUser, type UserPayload } from "../../api/users";
import { listEmployees } from "../../api/employees";
import { useAuth } from "../../context/AuthContext";
import { Field, ModalFooter, Select, TextInput } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { AppUser, Employee, UserRole } from "../../api/types";

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];

export default function UserFormModal({
  targetUser,
  onClose,
  onSaved,
}: {
  targetUser?: AppUser | null;
  onClose: () => void;
  onSaved: (user: AppUser) => void;
}) {
  const { user: currentUser } = useAuth();
  const isEdit = !!targetUser;
  // A plain admin can only ever create/leave accounts at "employee" — only
  // a superadmin can grant admin/superadmin access (enforced again
  // server-side; this just keeps the form honest about what will work).
  const canGrantElevated = currentUser?.role === "superadmin";
  const assignableRoles = canGrantElevated ? ALL_ROLES : ALL_ROLES.filter((r) => r.value === "employee");

  const [form, setForm] = useState<UserPayload>(
    targetUser ?? {
      username: "",
      first_name: "",
      last_name: "",
      email: "",
      role: "employee",
      employee_id: null,
      phone_code: "",
      phone: "",
    },
  );
  const [password, setPassword] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees(false).then(setEmployees);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEdit && !password) {
      setError("Set a password for this account.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: UserPayload = { ...form };
      if (password) payload.password = password;
      const saved = isEdit ? await updateUser(targetUser!.id, payload) : await createUser(payload);
      onSaved(saved);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit user" : "Add user"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" icon={UserIcon}>
              <TextInput
                value={form.username ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                required
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="First name">
              <TextInput value={form.first_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} required />
            </Field>
            <Field label="Last name" hint="(optional)">
              <TextInput value={form.last_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" hint="(optional)" icon={Mail}>
              <TextInput type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Phone" hint="(optional)" icon={Phone}>
              <div className="flex gap-2">
                <TextInput
                  value={form.phone_code ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone_code: e.target.value }))}
                  placeholder="+971"
                  className="w-24"
                />
                <TextInput value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="flex-1" />
              </div>
            </Field>
          </div>

          <Field label="Password" hint={isEdit ? "(leave blank to keep current)" : undefined} icon={KeyRound}>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              minLength={6}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Linked employee" hint="(optional — for attendance/salary)" icon={Link2}>
            <Select
              value={form.employee_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">None</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </Select>
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isEdit ? "Save changes" : "Create user"} />
      </form>
    </Modal>
  );
}
