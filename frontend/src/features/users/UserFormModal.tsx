import { useEffect, useState, type FormEvent } from "react";
import { Briefcase, Building2, KeyRound, Link2, Mail, Phone, ShieldCheck, User as UserIcon, Wallet } from "lucide-react";
import { createUser, listUsers, updateUser, type UserPayload } from "../../api/users";
import { createEmployee, listEmployees } from "../../api/employees";
import { useAuth } from "../../context/AuthContext";
import { useBusiness } from "../../context/BusinessContext";
import { Field, ModalFooter, RadioGroup, Select, TextInput, Toggle } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { AppUser, Employee, UserRole } from "../../api/types";
import { getErrorMessage } from "../../utils/errors";

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];

interface NewEmployeeForm {
  name: string;
  role: string;
  phone_code: string;
  phone: string;
  base_salary: string;
}

const emptyNewEmployee: NewEmployeeForm = { name: "", role: "", phone_code: "", phone: "", base_salary: "" };

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

  const [form, setForm] = useState<UserPayload>(
    targetUser
      ? {
          ...targetUser,
          // The form has a single Phone field, so an account stored as a
          // separate code + number is shown (and saved back) as one string.
          phone: [targetUser.phone_code, targetUser.phone].filter((p) => p && p.trim()).join(" "),
          phone_code: "",
        }
      : {
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
  // Only meaningful when adding: whether this person also gets a login, or
  // is just a staff record for attendance/salary (see Employee model —
  // "an employee may or may not be a user"). Editing always means an
  // account already exists, so this toggle doesn't apply there.
  const [createAccount, setCreateAccount] = useState(true);
  const [personMode, setPersonMode] = useState<"new" | "existing">("new");
  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm>(emptyNewEmployee);
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

  // The "Linked employee" / "existing employee" picker should only offer
  // employees nobody else already has a login through — otherwise picking
  // one just bounces back from the server with "already linked".
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
        // The employees endpoint 403s when the Attendance module is off for
        // this business — that's fine, it just means there's no roster to
        // offer for linking; "New person" doesn't depend on it at all.
        setEmployees([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableEmployees = employees.filter((e) => !linkedElsewhere.has(e.id));

  function buildEmployeePayload() {
    return {
      name: newEmployee.name,
      role: newEmployee.role || null,
      phone_code: newEmployee.phone_code || null,
      phone: newEmployee.phone || null,
      base_salary: newEmployee.base_salary === "" ? null : Number(newEmployee.base_salary),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Employee-only path: no login at all, just the staff record.
    if (!isEdit && !createAccount) {
      if (!newEmployee.name.trim()) {
        setError("Enter a name.");
        return;
      }
      setSaving(true);
      try {
        await createEmployee(buildEmployeePayload());
        onSaved();
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not save employee."));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!isEdit && !password) {
      setError("Set a password for this account.");
      return;
    }
    if (!isEdit && personMode === "new" && !newEmployee.name.trim()) {
      setError("Enter this person's name.");
      return;
    }
    if (!isEdit && personMode === "existing" && !form.employee_id) {
      setError("Select an employee.");
      return;
    }

    setSaving(true);
    try {
      const payload: UserPayload = { ...form };
      // The backend validates email strictly (EmailStr) — an empty string
      // isn't a valid email and isn't "no email" to it, only null/absent
      // is. The field is optional, so a blank input means null, not "".
      payload.email = payload.email || null;
      // The whole number now lives in `phone`; don't write an empty code.
      payload.phone_code = payload.phone_code || null;
      if (password) payload.password = password;
      if (!isEdit) {
        // The form only ever asks for a person's name once — here for a
        // brand-new person, or on the Employee record already for an
        // existing one — rather than a separate "account display name"
        // that could quietly drift from it.
        const fullName =
          personMode === "new" ? newEmployee.name.trim() : employees.find((e) => e.id === form.employee_id)?.name ?? "";
        const [first, ...rest] = fullName.split(" ");
        payload.first_name = first || fullName;
        payload.last_name = rest.join(" ") || null;
        payload.display_name = fullName;
      }
      if (!isEdit && personMode === "new") {
        payload.employee_id = null;
        payload.new_employee = buildEmployeePayload();
        // Reuse the one phone number entered on the employee record rather
        // than asking for it twice for the same person.
        payload.phone_code = payload.phone_code || newEmployee.phone_code || null;
        payload.phone = payload.phone || newEmployee.phone || null;
      }
      await (isEdit ? updateUser(targetUser!.id, payload) : createUser(payload));
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save user."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit user" : "Add person"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {!isEdit && (
            <div className="rounded-lg border border-line bg-bg p-4">
              <Toggle checked={createAccount} onChange={setCreateAccount} label="Create a login account for this person" />
              <p className="mt-1.5 pl-14 text-xs text-muted">
                {createAccount
                  ? "They'll be able to sign in. Turn this off to just add them as staff (for attendance/salary) with no login."
                  : "No login will be created — just a staff record for attendance and salary tracking. Add a login for them later from this same page."}
              </p>
            </div>
          )}

          {(!isEdit && createAccount) && (
            <RadioGroup
              value={personMode}
              onChange={setPersonMode}
              options={[
                { value: "new", label: "New person" },
                { value: "existing", label: "Existing employee" },
              ]}
            />
          )}

          {!isEdit && createAccount && personMode === "existing" ? (
            <Field label="Employee" hint="who this account belongs to" icon={Link2}>
              <Select
                value={form.employee_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value ? Number(e.target.value) : null }))}
                required
              >
                <option value="" disabled>
                  Select an employee…
                </option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : !isEdit ? (
            <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {createAccount ? "New person" : "New employee"}
              </p>
              <Field label="Name" icon={UserIcon}>
                <TextInput value={newEmployee.name} onChange={(e) => setNewEmployee((f) => ({ ...f, name: e.target.value }))} required maxLength={150} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Role" hint="(optional)" icon={Briefcase}>
                  <TextInput
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee((f) => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Front desk, Runner"
                  />
                </Field>
                <Field label="Base salary" hint="(optional)" icon={Wallet}>
                  <TextInput
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 3500"
                    value={newEmployee.base_salary}
                    onChange={(e) => setNewEmployee((f) => ({ ...f, base_salary: e.target.value }))}
                  />
                </Field>
              </div>
              {/* One field for the whole number. A separate code box shared the
                  row with it, and TextInput's built-in w-full overrode their
                  widths, squashing the number box into a blank sliver. */}
              <Field label="Phone" hint="(optional)" icon={Phone}>
                <TextInput
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+971 50 123 4567"
                  maxLength={50}
                />
              </Field>
            </div>
          ) : null}

          {(isEdit || createAccount) && (
            <>
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
                  Company: <span className="font-medium text-ink">{activeBusiness?.name ?? "—"}</span> (the
                  currently active business — switch it above to {isEdit ? "assign" : "add"} this account under a
                  different company)
                </p>
              )}

              {isEdit && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First name">
                    <TextInput value={form.first_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} required maxLength={100} />
                  </Field>
                  <Field label="Last name" hint="(optional)">
                    <TextInput value={form.last_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} maxLength={100} />
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Email" hint="(optional)" icon={Mail}>
                  <TextInput type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </Field>
                {(isEdit || personMode === "existing") && (
                  <Field label="Phone" hint="(optional)" icon={Phone}>
                    <TextInput
                      value={form.phone ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+971 50 123 4567"
                      maxLength={50}
                    />
                  </Field>
                )}
              </div>

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

              {isEdit && (
                <Field label="Linked employee" hint="(optional — for attendance/salary)" icon={Link2}>
                  <Select
                    value={form.employee_id ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">None</option>
                    {(targetUser?.employee_id
                      ? [...availableEmployees, ...employees.filter((emp) => emp.id === targetUser.employee_id)]
                      : availableEmployees
                    ).map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter
          onCancel={onClose}
          saving={saving}
          submitLabel={isEdit ? "Save changes" : createAccount ? "Create account" : "Add employee"}
        />
      </form>
    </Modal>
  );
}
