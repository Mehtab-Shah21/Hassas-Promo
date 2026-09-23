import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck, FileText, Paperclip, Plus, Trash2, Users } from "lucide-react";

import { getAttendanceTotals, getDayAttendance, markAttendance } from "../../api/attendance";
import { resolveAssetUrl } from "../../api/client";
import {
  addEmployeeDocument,
  createEmployee,
  deactivateEmployee,
  getEmployeeDetail,
  listEmployees,
  removeEmployeeDocument,
  updateEmployee,
  uploadEmployeeDocument,
  type EmployeeDocument,
  type EmployeePayload,
} from "../../api/employees";
import type {
  AttendanceStatus,
  DayAttendanceEntry,
  Employee,
  EmployeeDetail,
  EmployeeDocumentRecord,
  EmployeeSalaryEntry,
  EmployeeTotals,
} from "../../api/types";
import Modal from "../../components/Modal";
import { Field, SaveButton, TextInput } from "../../components/form/Field";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";
import { getErrorMessage } from "../../utils/errors";
import { DeductionActions, deductionWorking, shortDate } from "./DeductionControls";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-accent-green text-bg",
  absent: "bg-danger text-bg",
  half_day: "bg-link text-bg",
  leave: "bg-orange-50 text-bg",
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave",
};

type Tab = "people" | "attendance";

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>("people");

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink">Employees</h1>

      <div className="mb-5 flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
        <button
          onClick={() => setTab("people")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-colors ${
            tab === "people" ? "bg-accent text-ink" : "text-muted hover:bg-wash-1"
          }`}
        >
          <Users size={15} /> Staff
        </button>
        <button
          onClick={() => setTab("attendance")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-colors ${
            tab === "attendance" ? "bg-accent text-ink" : "text-muted hover:bg-wash-1"
          }`}
        >
          <CalendarCheck size={15} /> Attendance
        </button>
      </div>

      {tab === "people" ? <PeopleTab /> : <AttendanceTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ People */

function PeopleTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

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
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Staff</h2>
        <button
          onClick={() => setEditing("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
        >
          + Add employee
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : employees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          No employees yet. Add one to start tracking attendance and salaries.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr>
                <th className="py-1.5">Name</th>
                <th className="py-1.5">Role</th>
                <th className="py-1.5">Phone</th>
                <th className="py-1.5">Documents</th>
                <th className="py-1.5 pr-16 text-right">Salary status</th>
                <th className="py-1.5 pl-2">Status</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td className="py-2 font-medium text-ink">{emp.name}</td>
                  <td className="py-2 text-muted">{emp.role ?? "—"}</td>
                  <td className="py-2 text-muted">
                    {emp.phone ? `${emp.phone_code ?? ""} ${emp.phone}`.trim() : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      <DocumentChip label="EID" present={!!emp.emirates_id_attachment_path} />
                      <DocumentChip label="Passport" present={!!emp.passport_attachment_path} />
                    </div>
                  </td>
                  <td className="py-2 pr-16 text-right text-muted">
                    {emp.base_salary != null ? emp.base_salary.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pl-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        emp.is_active ? "bg-accent-green/20 text-accent-green" : "bg-wash-2 text-muted"
                      }`}
                    >
                      {emp.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <button onClick={() => setViewing(emp.id)} className="font-medium text-link hover:underline">
                        View
                      </button>
                      <button onClick={() => setEditing(emp)} className="font-medium text-link hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className="font-medium text-muted hover:text-danger"
                      >
                        {emp.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EmployeeFormModal
          employee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {viewing !== null && (
        <EmployeeDetailModal
          employeeId={viewing}
          onClose={() => setViewing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function DocumentChip({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      title={present ? `${label} attached` : `No ${label} attached`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        present ? "bg-link/15 text-link" : "bg-wash-2 text-muted"
      }`}
    >
      <Paperclip size={10} /> {label}
    </span>
  );
}

/* ----------------------------------------------------------- Employee form */

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
    email: employee?.email ?? "",
    base_salary: employee?.base_salary != null ? String(employee.base_salary) : "",
    emirates_id: employee?.emirates_id ?? "",
    passport_no: employee?.passport_no ?? "",
  });
  // A brand-new employee has no id yet, so their scans upload straight after
  // the record is created rather than as part of the same request.
  const [pendingDocs, setPendingDocs] = useState<Partial<Record<EmployeeDocument, File>>>({});
  // Anything beyond Emirates ID / passport: any number of name+file pairs,
  // queued here and uploaded (in order) once the employee record exists.
  // Previously-added ones are managed from the detail view instead, which is
  // where the full list actually lives.
  const [otherDocs, setOtherDocs] = useState<{ key: number; name: string; file: File | null }[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOtherDocRow() {
    setOtherDocs((rows) => [...rows, { key: nextKey, name: "", file: null }]);
    setNextKey((k) => k + 1);
  }
  function updateOtherDocRow(key: number, patch: Partial<{ name: string; file: File | null }>) {
    setOtherDocs((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeOtherDocRow(key: number) {
    setOtherDocs((rows) => rows.filter((r) => r.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // A file picked without a name (or vice versa) is ambiguous -- better to
    // ask than to silently drop it or guess a name from the filename.
    const incomplete = otherDocs.some((r) => !!r.file !== !!r.name.trim());
    if (incomplete) {
      setError("Give every other document both a name and a file, or remove the row.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeePayload = {
        name: form.name,
        role: form.role || null,
        phone_code: form.phone_code || null,
        phone: form.phone || null,
        email: form.email.trim() || null,
        base_salary: form.base_salary === "" ? null : Number(form.base_salary),
        emirates_id: form.emirates_id || null,
        passport_no: form.passport_no || null,
      };
      const saved = employee ? await updateEmployee(employee.id, payload) : await createEmployee(payload);

      for (const [document, file] of Object.entries(pendingDocs)) {
        if (file) await uploadEmployeeDocument(saved.id, document as EmployeeDocument, file);
      }
      for (const row of otherDocs) {
        if (row.file && row.name.trim()) await addEmployeeDocument(saved.id, row.name.trim(), row.file);
      }
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save this employee."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={employee ? "Edit employee" : "Add employee"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={150}
          />
        </Field>
        <Field label="Role">
          <TextInput
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="e.g. Front desk, Runner"
            maxLength={100}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code">
            <TextInput
              value={form.phone_code}
              onChange={(e) => setForm((f) => ({ ...f, phone_code: e.target.value }))}
              placeholder="+971"
              maxLength={10}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Phone">
              <TextInput
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                maxLength={50}
              />
            </Field>
          </div>
        </div>

        <Field label="Email" hint="(optional)">
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="name@example.com"
            maxLength={255}
          />
        </Field>

        <div className="rounded-lg border border-line p-3">
          <h3 className="mb-3 text-sm font-semibold text-ink">Emirates ID</h3>
          <Field label="Emirates ID number">
            <TextInput
              value={form.emirates_id}
              onChange={(e) => setForm((f) => ({ ...f, emirates_id: e.target.value }))}
              placeholder="784-XXXX-XXXXXXX-X"
              maxLength={50}
            />
          </Field>
          <DocumentUpload
            label="Attach Emirates ID"
            existingPath={employee?.emirates_id_attachment_path ?? null}
            onPick={(file) => setPendingDocs((d) => ({ ...d, "emirates-id": file }))}
            picked={pendingDocs["emirates-id"]}
          />
        </div>

        <div className="rounded-lg border border-line p-3">
          <h3 className="mb-3 text-sm font-semibold text-ink">Passport</h3>
          <Field label="Passport number">
            <TextInput
              value={form.passport_no}
              onChange={(e) => setForm((f) => ({ ...f, passport_no: e.target.value }))}
              maxLength={50}
            />
          </Field>
          <DocumentUpload
            label="Attach passport"
            existingPath={employee?.passport_attachment_path ?? null}
            onPick={(file) => setPendingDocs((d) => ({ ...d, passport: file }))}
            picked={pendingDocs.passport}
          />
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Other documents</h3>
            <button
              type="button"
              onClick={addOtherDocRow}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-link hover:bg-wash-2"
            >
              <Plus size={13} /> Add a document
            </button>
          </div>
          <p className="mb-2 text-xs text-muted">
            Anything else — a license, a work permit, a certificate. Name it and attach it; add as many as you need.
          </p>
          {otherDocs.length > 0 && (
            <div className="space-y-2">
              {otherDocs.map((row) => (
                <div key={row.key} className="flex items-start gap-2 rounded-md bg-wash-1 p-2">
                  <div className="flex-1 space-y-1.5">
                    <TextInput
                      value={row.name}
                      onChange={(e) => updateOtherDocRow(row.key, { name: e.target.value })}
                      placeholder="Name, e.g. Driving license"
                      maxLength={150}
                    />
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => updateOtherDocRow(row.key, { file: e.target.files?.[0] ?? null })}
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-wash-2 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-wash-3"
                    />
                    {row.file && <p className="text-xs text-accent-green">Selected: {row.file.name} — uploads when you save.</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOtherDocRow(row.key)}
                    aria-label="Remove this document"
                    className="mt-1.5 shrink-0 rounded-md p-1.5 text-muted hover:bg-wash-2 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {employee && (
            <p className="mt-2 text-xs text-muted">
              Already-attached documents are managed from this employee's detail view.
            </p>
          )}
        </div>

        <Field label="Base salary" hint="(used as the default when setting up a recurring salary)">
          <TextInput
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 3500"
            value={form.base_salary}
            onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))}
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}
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

function DocumentUpload({
  label,
  existingPath,
  onPick,
  picked,
}: {
  label: string;
  existingPath: string | null;
  onPick: (file: File) => void;
  picked?: File;
}) {
  return (
    <div className="mt-2 space-y-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
        }}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-wash-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-wash-3"
      />
      {picked ? (
        <p className="text-xs text-accent-green">Selected: {picked.name} — uploads when you save.</p>
      ) : existingPath ? (
        <a
          href={resolveAssetUrl(existingPath) ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-link hover:underline"
        >
          <FileText size={12} /> View current file
        </a>
      ) : (
        <p className="text-xs text-muted">PDF or image, up to 10MB.</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Employee detail */

function EmployeeDetailModal({
  employeeId,
  onClose,
  onChanged,
}: {
  employeeId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { activeBusiness } = useBusiness();
  const currency = currencyLabel(activeBusiness);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setDetail(await getEmployeeDetail(employeeId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function handleUpload(document: EmployeeDocument, file: File) {
    await uploadEmployeeDocument(employeeId, document, file);
    await load();
    onChanged();
  }

  if (loading || !detail) {
    return (
      <Modal title="Employee" onClose={onClose} wide>
        <p className="text-sm text-muted">Loading...</p>
      </Modal>
    );
  }

  const emp = detail.employee;

  return (
    <Modal title={emp.name} onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Details</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <DetailRow label="Role" value={emp.role ?? "—"} />
            <DetailRow
              label="Phone"
              value={emp.phone ? `${emp.phone_code ?? ""} ${emp.phone}`.trim() : "—"}
            />
            <DetailRow label="Email" value={emp.email ?? "—"} />
            <DetailRow label="Emirates ID number" value={emp.emirates_id ?? "—"} />
            <DetailRow label="Passport no." value={emp.passport_no ?? "—"} />
            <DetailRow label="Base salary" value={emp.base_salary != null ? emp.base_salary.toFixed(2) : "—"} />
            <DetailRow label="Status" value={emp.is_active ? "Active" : "Inactive"} />
            <DetailRow
              label="Login account"
              value={detail.username ? `${detail.username} (${detail.user_role})` : "No login"}
            />
            <DetailRow
              label="Recurring salary"
              value={
                detail.recurring_salary_amount != null
                  ? `${detail.recurring_salary_amount.toFixed(2)} / month`
                  : "Not set up"
              }
            />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Documents</h3>
          <div className="grid grid-cols-2 gap-4">
            <DetailDocument
              label="Emirates ID"
              path={emp.emirates_id_attachment_path}
              onUpload={(file) => handleUpload("emirates-id", file)}
            />
            <DetailDocument
              label="Passport"
              path={emp.passport_attachment_path}
              onUpload={(file) => handleUpload("passport", file)}
            />
          </div>

          <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Other documents</h4>
          {detail.documents.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {detail.documents.map((doc) => (
                <OtherDocumentRow
                  key={doc.id}
                  document={doc}
                  onRemove={async () => {
                    await removeEmployeeDocument(employeeId, doc.id);
                    await load();
                    onChanged();
                  }}
                />
              ))}
            </ul>
          )}
          <AddOtherDocument
            employeeId={employeeId}
            onAdded={async () => {
              await load();
              onChanged();
            }}
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">This month's attendance</h3>
          <div className="flex gap-3 text-sm">
            <StatPill label="Present" value={detail.present_days} className="text-accent-green" />
            <StatPill label="Absent" value={detail.absent_days} className="text-danger" />
            <StatPill label="Half day" value={detail.half_days} className="text-link" />
            <StatPill label="Leave" value={detail.leave_days} className="text-orange-50" />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Salary</h3>
          <div className="mb-3 flex gap-3 text-sm">
            <StatPill label="Paid to date" value={detail.total_paid.toFixed(2)} className="text-accent-green" />
            <StatPill label="Still pending" value={detail.total_pending.toFixed(2)} className="text-orange-50" />
          </div>
          {detail.salary_entries.length === 0 ? (
            <p className="text-sm text-muted">No salary entries recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="py-1.5">Month</th>
                  <th className="py-1.5 text-right">Amount</th>
                  <th className="py-1.5 pl-4">Source</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5">Absence deduction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.salary_entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-1.5 text-ink">{entry.date}</td>
                    <td className="py-1.5 text-right text-ink">{entry.amount}</td>
                    <td className="py-1.5 pl-4">
                      {entry.recurring_expense_id ? (
                        <span className="rounded-full bg-link/15 px-2 py-0.5 text-[11px] font-medium text-link">
                          Recurring
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Manual</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          entry.is_paid
                            ? "bg-accent-green/20 text-accent-green"
                            : "bg-orange-50/20 text-orange-50"
                        }`}
                      >
                        {entry.is_paid ? "Paid" : "Pending"}
                      </span>
                    </td>
                    <td className="py-1.5 align-top">
                      <DeductionCell
                        entry={entry}
                        currency={currency}
                        onChanged={() => {
                          load();
                          onChanged();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** One salary payment's absence deduction: the state, the working, and (for admins) the buttons. */
function DeductionCell({
  entry,
  currency,
  onChanged,
}: {
  entry: EmployeeSalaryEntry;
  currency: string;
  onChanged: () => void;
}) {
  const d = entry.deduction;
  if (!d || d.status === "none") return <span className="text-xs text-muted">—</span>;

  const badge =
    d.status === "confirmed"
      ? { text: `Deducted ${currency} ${d.amount.toFixed(2)}`, style: "bg-danger/15 text-danger" }
      : d.status === "waived"
        ? { text: "Not deducted", style: "bg-wash-1 text-muted" }
        : { text: "Awaiting confirmation", style: "bg-orange-50/20 text-orange-50" };

  return (
    <div className="space-y-1">
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.style}`}>{badge.text}</span>
      <p className="text-xs text-muted">{deductionWorking(d, currency)}</p>
      {d.status === "pending" && (
        <p className="text-xs text-muted">
          {d.can_decide
            ? `Would pay ${currency} ${d.net_amount.toFixed(2)} instead of ${d.gross_amount.toFixed(2)}`
            : `Can be confirmed from the pay date, ${shortDate(d.pay_date)}`}
        </p>
      )}
      {d.decided_by_name && d.status !== "pending" && (
        <p className="text-xs text-muted">Decided by {d.decided_by_name}</p>
      )}
      <DeductionActions expenseId={entry.id} deduction={d} isPaid={entry.is_paid} onChanged={onChanged} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function StatPill({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-line px-3 py-2">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className={`text-lg font-semibold ${className ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

/** One already-attached "other" document: its name, a link to open it, and a remove button. */
function OtherDocumentRow({ document, onRemove }: { document: EmployeeDocumentRecord; onRemove: () => Promise<void> }) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
      <a
        href={resolveAssetUrl(document.file_path) ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-1.5 text-link hover:underline"
      >
        <FileText size={13} className="shrink-0" />
        <span className="truncate">{document.name}</span>
      </a>
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        className="ml-3 shrink-0 rounded-md p-1 text-muted hover:bg-wash-2 hover:text-danger disabled:opacity-50"
        aria-label={`Remove ${document.name}`}
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

/** Add one more named document to an employee that already exists. */
function AddOtherDocument({ employeeId, onAdded }: { employeeId: number; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim() || !file) return;
    setSaving(true);
    setError(null);
    try {
      await addEmployeeDocument(employeeId, name.trim(), file);
      setName("");
      setFile(null);
      await onAdded();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not attach that document."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md bg-wash-1 p-2">
      <div className="flex-1 space-y-1.5">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Driving license" maxLength={150} />
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-wash-2 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-wash-3"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={saving || !name.trim() || !file}
        className="mt-1.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-ink hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={13} /> Add
      </button>
    </div>
  );
}

function DetailDocument({
  label,
  path,
  onUpload,
}: {
  label: string;
  path: string | null;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-1 text-xs font-semibold uppercase text-muted">{label}</p>
      {path ? (
        <a
          href={resolveAssetUrl(path) ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <FileText size={13} /> View file
        </a>
      ) : (
        <p className="text-sm text-muted">Not attached</p>
      )}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
        className="mt-2 block w-full text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-wash-2 file:px-2 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-wash-3"
      />
    </div>
  );
}

/* -------------------------------------------------------------- Attendance */

/** "HH:MM:SS" (server) -> "HH:MM" (what <input type="time"> speaks). */
function hhmm(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Length of a day's stay as "8h 30m", or null unless both times are recorded. */
function stayLength(checkIn: string, checkOut: string): string | null {
  if (!checkIn || !checkOut) return null;
  const [ih, im] = checkIn.split(":").map(Number);
  const [oh, om] = checkOut.split(":").map(Number);
  const minutes = oh * 60 + om - (ih * 60 + im);
  if (minutes <= 0) return null;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatHours(hours: number): string {
  if (!hours) return "—";
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

function AttendanceTab() {
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<DayAttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [totals, setTotals] = useState<EmployeeTotals[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      // No times passed: re-marking someone "Present" keeps their arrival and
      // departure. Marking absent/leave clears them (server-side).
      await markAttendance(employeeId, date, status);
      loadDay();
      loadTotals();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not update attendance."));
    }
  }

  // Recording a time means the person was in, so an unmarked day becomes
  // "present" on the spot (a half day stays a half day); a day marked absent/leave has its inputs disabled
  // instead, so a stray click can't quietly flip that status.
  async function handleTime(entry: DayAttendanceEntry, field: "check_in" | "check_out", value: string) {
    setError(null);
    try {
      await markAttendance(entry.employee_id, date, entry.status ?? "present", { [field]: value || null });
      loadDay();
      loadTotals();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save that time."));
      loadDay();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No active employees. Add one on the Staff tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="py-1.5">Employee</th>
                  <th className="py-1.5">Mark</th>
                  <th className="py-1.5">Came in</th>
                  <th className="py-1.5">Left</th>
                  <th className="py-1.5 text-right">Time in office</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => {
                  const timesEnabled = e.status === null || e.status === "present" || e.status === "half_day";
                  const stay = stayLength(hhmm(e.check_in), hhmm(e.check_out));
                  return (
                    <tr key={e.employee_id}>
                      <td className="py-2 font-medium text-ink">{e.employee_name}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          {(["present", "absent", "half_day", "leave"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => handleMark(e.employee_id, s)}
                              className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ${
                                e.status === s ? STATUS_STYLES[s] : "border border-line text-muted hover:bg-wash-1"
                              }`}
                            >
                              {STATUS_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2">
                        <TimeCell
                          // Re-mount when the saved value changes so the field
                          // shows what the server actually stored.
                          key={`in-${e.employee_id}-${date}-${e.check_in}`}
                          value={hhmm(e.check_in)}
                          disabled={!timesEnabled}
                          label={`${e.employee_name} came in`}
                          onCommit={(v) => handleTime(e, "check_in", v)}
                        />
                      </td>
                      <td className="py-2">
                        <TimeCell
                          key={`out-${e.employee_id}-${date}-${e.check_out}`}
                          value={hhmm(e.check_out)}
                          disabled={!timesEnabled || !e.check_in}
                          label={`${e.employee_name} left`}
                          onCommit={(v) => handleTime(e, "check_out", v)}
                        />
                      </td>
                      <td className="py-2 text-right text-muted">{stay ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Enter the time someone came in, then the time they left. Setting a time marks them present. "Now" fills in
          the current time. Only Absent (a whole day) and Half day (half a day) reduce pay — Leave, coming in late or
          leaving early do not.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-ink">Totals</h2>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-line px-2 py-1 text-sm"
          />
          <span className="text-sm text-muted">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-line px-2 py-1 text-sm"
          />
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
                <th className="py-1.5 text-right">Half day</th>
                <th className="py-1.5 text-right">Leave</th>
                <th className="py-1.5 text-right">Hours in office</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {totals.map((t) => (
                <tr key={t.employee_id}>
                  <td className="py-1.5 font-medium text-ink">{t.employee_name}</td>
                  <td className="py-1.5 text-right text-accent-green">{t.present}</td>
                  <td className="py-1.5 text-right text-danger">{t.absent}</td>
                  <td className="py-1.5 text-right text-link">{t.half_day}</td>
                  <td className="py-1.5 text-right text-orange-50">{t.leave}</td>
                  <td className="py-1.5 text-right text-muted">{formatHours(t.hours_worked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * One time box. Committed on blur, not on every keystroke: a time input yields
 * intermediate values while you're still typing the hour/minute, and saving
 * those would fire a request (and a re-render that fights the cursor) for each.
 */
function TimeCell({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="time"
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        className="w-28 rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink disabled:opacity-40"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const now = nowHHMM();
          setDraft(now);
          onCommit(now);
        }}
        className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-wash-1 disabled:opacity-40"
      >
        Now
      </button>
    </div>
  );
}
