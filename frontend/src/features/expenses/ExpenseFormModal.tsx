import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, FileText, Link2, Paperclip, Receipt, Wallet } from "lucide-react";
import { createExpense, updateExpense, uploadExpenseAttachment, type ExpensePayload } from "../../api/expenses";
import { listEmployees } from "../../api/employees";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";
import { resolveAssetUrl } from "../../api/client";
import { Field, ModalFooter, Select, TextArea, TextInput, Toggle } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { Employee, Expense, ExpenseType } from "../../api/types";
import { getErrorMessage } from "../../utils/errors";

// Adding an expense by hand is now only ever a one-off company expense:
// salaries and overheads are set up once under Recurring / Fixed and appear
// every month by themselves, so there is no type to choose and no chance of
// hand-keying a cost that's already being generated. Editing an existing
// entry still shows its type, including generated salary/overhead rows.
const TYPE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: "salary", label: "Salary" },
  { value: "overhead", label: "Overhead" },
  { value: "company_expense", label: "Company expense" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseFormModal({
  expense,
  onClose,
  onSaved,
}: {
  expense?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { activeBusiness } = useBusiness();
  const isEdit = !!expense;
  const currency = currencyLabel(activeBusiness);

  const [type, setType] = useState<ExpenseType>(expense?.type ?? "company_expense");
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [date, setDate] = useState(expense?.date ?? today());
  const [employeeId, setEmployeeId] = useState<number | "">(expense?.employee_id ?? "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isPaid, setIsPaid] = useState(expense?.is_paid ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees(true).then(setEmployees);
  }, []);

  // Picking an employee copies their base_salary into the amount field as a
  // one-time starting point — the admin can still freely edit it afterward
  // (a bonus, deduction, or partial pay), and doing so never writes back to
  // Employee.base_salary since this form only ever touches the Expense row.
  function handleEmployeeChange(id: number | "") {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp?.base_salary != null) {
      setAmount(String(emp.base_salary));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (type === "salary" && !employeeId) {
      setError("Select an employee for a salary expense.");
      return;
    }
    if (!amount) {
      setError("Enter an amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: ExpensePayload = {
        type,
        amount: Number(amount),
        description: description || null,
        date,
        employee_id: type === "salary" ? (employeeId as number) : null,
        is_paid: isPaid,
        paid_on: isPaid ? (expense?.paid_on ?? date) : null,
      };
      const saved = isEdit ? await updateExpense(expense!.id, payload) : await createExpense(payload);
      if (file) {
        await uploadExpenseAttachment(saved.id, file);
      }
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save expense."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit expense" : "Add expense"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {isEdit ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type" icon={Receipt}>
                <Select value={type} onChange={(e) => setType(e.target.value as ExpenseType)}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" icon={CalendarDays}>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </div>
          ) : (
            <>
              <p className="rounded-md bg-wash-1 p-3 text-xs text-muted">
                This is for a <span className="font-medium text-ink">one-off company expense</span>. Salaries and
                overheads live under <span className="font-medium text-ink">Recurring / Fixed</span> — set one up
                once and it's added to every month for you.
              </p>
              <Field label="Date" icon={CalendarDays}>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </>
          )}

          {type === "salary" && (
            <Field label="Employee" icon={Link2}>
              <Select value={employeeId} onChange={(e) => handleEmployeeChange(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select an employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.base_salary != null ? ` (base ${emp.base_salary})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="Amount"
            icon={Wallet}
            hint={type === "salary" ? "(auto-filled from base salary — editable for this payment)" : undefined}
          >
            <TextInput
              type="number"
              step="any"
              min="0"
              prefix={currency}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>

          <Field label="Description" hint="(optional)" icon={FileText}>
            <TextArea rows={2} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {/* A generated salary/overhead arrives as owed; this is how one
              month gets settled without touching the recurring setup. */}
          <Toggle
            checked={isPaid}
            onChange={setIsPaid}
            label={isPaid ? "Paid" : "Not paid yet (counts as pending)"}
          />

          {isEdit && expense?.recurring_expense_id && (
            <p className="rounded-md bg-wash-1 p-3 text-xs text-muted">
              This entry was generated from a fixed monthly cost. Editing it changes{" "}
              <span className="font-medium text-ink">this month only</span> — the monthly setup stays as it is.
            </p>
          )}

          <Field label="Attachment" hint="(optional — receipt, invoice or payslip: PDF or image)" icon={Paperclip}>
            {expense?.attachment_path && !file && (
              <p className="mb-1.5 text-xs text-muted">
                Current file:{" "}
                <a href={resolveAssetUrl(expense.attachment_path) ?? "#"} target="_blank" rel="noreferrer" className="text-link hover:underline">
                  view
                </a>{" "}
                — choosing a new file below replaces it.
              </p>
            )}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:opacity-90"
            />
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isEdit ? "Save changes" : "Add expense"} />
      </form>
    </Modal>
  );
}
