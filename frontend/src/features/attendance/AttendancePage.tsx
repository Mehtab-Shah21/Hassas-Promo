import { useEffect, useState, type FormEvent } from "react";
import { getAttendanceTotals, getDayAttendance, markAttendance } from "../../api/attendance";
import { createEmployee, deactivateEmployee, listEmployees, updateEmployee, type EmployeePayload } from "../../api/employees";
import type { AttendanceStatus, DayAttendanceEntry, Employee, EmployeeTotals } from "../../api/types";
import Modal from "../../components/Modal";
import { Field, SaveButton, TextInput } from "../../components/form/Field";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-accent-green text-white",
  absent: "bg-danger text-white",
  leave: "bg-orange-50 text-white",
};

export default function AttendancePage() {
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<DayAttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [totals, setTotals] = useState<EmployeeTotals[]>([]);
  const [showEmployees, setShowEmployees] = useState(false);

  async function loadDay() {
    setLoading(true);
    try {
      setEntries(await getDayAttendance(date));
    } finally {
      setLoading(false);
    }
  }

  async function loadTotals() {
    setTotals(await getAttendanceTotals(dateFrom, dateTo));
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    loadTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  async function handleMark(employeeId: number, status: AttendanceStatus) {
    await markAttendance(employeeId, date, status);
    loadDay();
    loadTotals();
  }

  function refreshAll() {
    loadDay();
    loadTotals();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Attendance</h1>
        <button
          onClick={() => setShowEmployees(true)}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1"
        >
          Manage employees
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-line px-3 py-1.5 text-sm" />
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No employees found. Click "Manage employees" to add some.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr>
                <th className="py-1.5">Employee</th>
                <th className="py-1.5">Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => (
                <tr key={e.employee_id}>
                  <td className="py-2 font-medium text-ink">{e.employee_name}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {(["present", "absent", "leave"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleMark(e.employee_id, s)}
                          className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                            e.status === s ? STATUS_STYLES[s] : "border border-line text-muted hover:bg-wash-1"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-ink">Totals</h2>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-line px-2 py-1 text-sm" />
          <span className="text-sm text-muted">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-line px-2 py-1 text-sm" />
        </div>
        {totals.length === 0 ? (
          <p className="text-sm text-muted">No data.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr>
                <th className="py-1.5">Employee</th>
                <th className="py-1.5 text-right">Present</th>
                <th className="py-1.5 text-right">Absent</th>
                <th className="py-1.5 text-right">Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {totals.map((t) => (
                <tr key={t.employee_id}>
                  <td className="py-1.5 font-medium text-ink">{t.employee_name}</td>
                  <td className="py-1.5 text-right text-accent-green">{t.present}</td>
                  <td className="py-1.5 text-right text-danger">{t.absent}</td>
                  <td className="py-1.5 text-right text-orange-50">{t.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEmployees && (
        <EmployeesModal
          onClose={() => setShowEmployees(false)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}

function EmployeesModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  async function load() {
    setLoading(true);
    try {
      setEmployees(await listEmployees(false));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(emp: Employee) {
    if (emp.is_active) {
      await deactivateEmployee(emp.id);
    } else {
      await updateEmployee(emp.id, { is_active: true });
    }
    load();
    onChanged();
  }

  return (
    <Modal title="Manage employees" onClose={onClose} wide>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setEditing("new")} className="text-sm font-medium text-accent hover:underline">
          + Add employee
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : employees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          No employees yet. Add one to start tracking attendance.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="py-1.5">Name</th>
              <th className="py-1.5">Role</th>
              <th className="py-1.5">Phone</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="py-2 font-medium text-ink">{emp.name}</td>
                <td className="py-2 text-muted">{emp.role ?? "—"}</td>
                <td className="py-2 text-muted">{emp.phone ? `${emp.phone_code ?? ""} ${emp.phone}` : "—"}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${emp.is_active ? "bg-accent-green/10 text-accent-green" : "bg-wash-2 text-muted"}`}>
                    {emp.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-3 text-xs">
                    <button onClick={() => setEditing(emp)} className="font-medium text-accent hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(emp)} className="font-medium text-muted hover:text-danger">
                      {emp.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EmployeeFormModal
          employee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    role: employee?.role ?? "",
    phone_code: employee?.phone_code ?? "",
    phone: employee?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: EmployeePayload = {
        name: form.name,
        role: form.role || null,
        phone_code: form.phone_code || null,
        phone: form.phone || null,
      };
      if (employee) {
        await updateEmployee(employee.id, payload);
      } else {
        await createEmployee(payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={employee ? "Edit employee" : "Add employee"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="Role (optional)">
          <TextInput value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. Front desk, Runner" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code">
            <TextInput value={form.phone_code} onChange={(e) => setForm((f) => ({ ...f, phone_code: e.target.value }))} placeholder="+971" />
          </Field>
          <div className="col-span-2">
            <Field label="Phone (optional)">
              <TextInput value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-wash-2">
            Cancel
          </button>
          <SaveButton saving={saving} />
        </div>
      </form>
    </Modal>
  );
}
