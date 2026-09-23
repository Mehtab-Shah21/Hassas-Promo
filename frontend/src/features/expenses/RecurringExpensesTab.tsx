import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, FileText, Info, RefreshCw, Repeat, User as UserIcon, Wallet } from "lucide-react";

import { listEmployees } from "../../api/employees";
import {
  createRecurringExpense,
  generateRecurringNow,
  getFixedCostSummary,
  listRecurringExpenses,
  stopRecurringExpense,
  updateRecurringExpense,
  type RecurringExpensePayload,
} from "../../api/recurringExpenses";
import type { Employee, ExpenseType, FixedCostSummary, RecurringExpense } from "../../api/types";
import Modal from "../../components/Modal";
import { Field, ModalFooter, RadioGroup, Select, TextInput } from "../../components/form/Field";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";
import { getErrorMessage } from "../../utils/errors";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-09-15" -> "15 Sep 2026" (parsed by hand so it never shifts a day with the timezone). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The one place every standing salary and overhead lives. Each row here is a
 * definition, not a payment: the system turns it into a real expense every
 * month by itself, so nobody has to remember the list or re-key it.
 */
export default function RecurringExpensesTab({ onChanged }: { onChanged: () => void }) {
  const { activeBusiness } = useBusiness();
  const currency = currencyLabel(activeBusiness);

  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [summary, setSummary] = useState<FixedCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RecurringExpense | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [rows, s] = await Promise.all([listRecurringExpenses(true), getFixedCostSummary()]);
      setItems(rows);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeBusiness) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id]);

  async function handleStop(item: RecurringExpense) {
    if (
      !confirm(
        `Stop "${item.label}" from this month on?\n\nMonths already recorded stay exactly as they are — only future months stop.`,
      )
    )
      return;
    await stopRecurringExpense(item.id);
    await load();
    onChanged();
  }

  async function handleResume(item: RecurringExpense) {
    await updateRecurringExpense(item.id, { is_active: true });
    await load();
    onChanged();
  }

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);
    try {
      const s = await generateRecurringNow();
      setSummary(s);
      setMessage("Up to date — every month due has been added.");
      await load();
      onChanged();
    } finally {
      setGenerating(false);
    }
  }

  const active = items.filter((i) => i.is_active);
  const stopped = items.filter((i) => !i.is_active);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Committed every month"
          value={`${currency} ${(summary?.monthly_commitment ?? 0).toFixed(2)}`}
          hint={`${summary?.active_count ?? 0} active item${summary?.active_count === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Paid this month"
          value={`${currency} ${(summary?.paid ?? 0).toFixed(2)}`}
          className="text-accent-green"
        />
        <SummaryCard
          label="Still pending this month"
          value={`${currency} ${(summary?.pending ?? 0).toFixed(2)}`}
          className="text-orange-50"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Repeat size={14} className="opacity-70" /> Fixed monthly costs
            </h2>
            <p className="text-xs text-muted">
              Set one up once and it's added to every month automatically, rolling into next year with no gap.
              Changing an amount applies to future months; past records stay as they were.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              title="Add any months that are due right now"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1 disabled:opacity-50"
            >
              <RefreshCw size={13} /> {generating ? "Working..." : "Catch up"}
            </button>
            <button
              onClick={() => setEditing("new")}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
            >
              + Add fixed cost
            </button>
          </div>
        </div>

        {message && <p className="mb-3 text-sm text-accent-green">{message}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
            Nothing set up yet. Add your salaries and overheads once, and they'll appear in every month by themselves.
          </p>
        ) : (
          <>
            <RecurringTable
              rows={active}
              currency={currency}
              onEdit={setEditing}
              onStop={handleStop}
              onResume={handleResume}
            />
            {stopped.length > 0 && (
              <div className="mt-7">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Stopped
                  <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-muted">
                    {stopped.length}
                  </span>
                </h3>
                <RecurringTable
                  rows={stopped}
                  currency={currency}
                  onEdit={setEditing}
                  onStop={handleStop}
                  onResume={handleResume}
                />
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <RecurringFormModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${className ?? "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// One shared set of widths so the "Active" and "Stopped" tables line up
// exactly instead of each sizing itself to its own contents.
const COLUMNS = ["27%", "12%", "17%", "24%", "8%", "12%"];

function RecurringTable({
  rows,
  currency,
  onEdit,
  onStop,
  onResume,
}: {
  rows: RecurringExpense[];
  currency: string;
  onEdit: (item: RecurringExpense) => void;
  onStop: (item: RecurringExpense) => void;
  onResume: (item: RecurringExpense) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          {COLUMNS.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
        <thead className="bg-wash-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5">What</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5 text-right">Amount / month</th>
            <th className="px-3 py-2.5">Runs</th>
            <th className="px-3 py-2.5 text-right">Added</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((item) => {
            // Only the data dims for a stopped item — its Resume action has to
            // stay fully legible or it looks disabled.
            const dim = item.is_active ? "" : "opacity-55";
            return (
              <tr key={item.id} className="transition-colors hover:bg-wash-1/60">
                <td className={`px-4 py-3 ${dim}`}>
                  <p className="truncate font-medium text-ink" title={item.label}>
                    {item.label}
                  </p>
                  {item.employee_name && (
                    <p className="mt-0.5 truncate text-xs text-muted" title={item.employee_name}>
                      {item.employee_name}
                    </p>
                  )}
                </td>
                <td className={`px-3 py-3 ${dim}`}>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.type === "salary" ? "bg-link/15 text-link" : "bg-orange-50/20 text-orange-50"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {item.type === "salary" ? "Salary" : "Overhead"}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${dim}`}>
                  <span className="mr-1 text-xs text-muted">{currency}</span>
                  <span className="font-semibold text-ink">{item.amount.toFixed(2)}</span>
                </td>
                <td className={`px-3 py-3 ${dim}`}>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
                    <span className="whitespace-nowrap">{formatDate(item.start_date)}</span>
                    <span aria-hidden>→</span>
                    {item.end_date ? (
                      <span className="whitespace-nowrap">{formatDate(item.end_date)}</span>
                    ) : (
                      <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-[11px] font-medium text-accent-green">
                        Ongoing
                      </span>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-3 text-right tabular-nums text-muted ${dim}`}>{item.generated_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(item)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-link transition-colors hover:bg-link/10"
                    >
                      Edit
                    </button>
                    {item.is_active ? (
                      <button
                        onClick={() => onStop(item)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => onResume(item)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/10"
                      >
                        Resume
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------- calendar-accurate preview */
// Mirrors services/recurring_expenses.py (covered_period / prorated_amount) so
// the form can show, before saving, exactly what each month will be charged.
// The server is the source of truth; this is only a preview.

function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
}

/** Real length of a month: 28, 29, 30 or 31. */
function daysIn(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** amount x covered/total, to the cent (half-up, as the server rounds). */
function prorateCents(amount: number, covered: number, total: number): number {
  if (covered >= total) return Math.round(amount * 100);
  return Math.round((amount * 100 * covered) / total + 1e-9);
}

function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthName(y: number, m: number): string {
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

interface PreviewRow {
  key: string;
  period: string;
  detail: string;
  cents: number;
  partial: boolean;
}

function buildPreview(amount: number, startISO: string, endISO: string): PreviewRow[] {
  const s = parseISO(startISO);
  const e = endISO ? parseISO(endISO) : null;
  if (!s || !(amount > 0)) return [];
  if (e && (e.y < s.y || (e.y === s.y && (e.m < s.m || (e.m === s.m && e.d < s.d))))) return [];

  const rows: PreviewRow[] = [];
  const firstTotal = daysIn(s.y, s.m);
  const sameMonth = !!e && e.y === s.y && e.m === s.m;
  const firstCovered = (sameMonth ? e!.d : firstTotal) - s.d + 1;
  rows.push({
    key: "first",
    period: monthName(s.y, s.m),
    detail: firstCovered >= firstTotal ? "Full month" : `${firstCovered} of ${firstTotal} days`,
    cents: prorateCents(amount, firstCovered, firstTotal),
    partial: firstCovered < firstTotal,
  });
  if (sameMonth) return rows;

  if (!e) {
    rows.push({
      key: "after",
      period: "Every month after",
      detail: "Full month — 1st to last day",
      cents: prorateCents(amount, 1, 1),
      partial: false,
    });
    return rows;
  }

  const between = (e.y - s.y) * 12 + (e.m - s.m) - 1;
  if (between > 0) {
    rows.push({
      key: "between",
      period: between === 1 ? "1 month in between" : `${between} months in between`,
      detail: "Full month each",
      cents: prorateCents(amount, 1, 1),
      partial: false,
    });
  }
  const lastTotal = daysIn(e.y, e.m);
  rows.push({
    key: "last",
    period: monthName(e.y, e.m),
    detail: e.d >= lastTotal ? "Full month" : `${e.d} of ${lastTotal} days`,
    cents: prorateCents(amount, e.d, lastTotal),
    partial: e.d < lastTotal,
  });
  return rows;
}

function ChargePreview({ amount, currency, start, end }: { amount: number; currency: string; start: string; end: string }) {
  const rows = buildPreview(amount, start, end);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <p className="bg-wash-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        How it will be charged
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2 font-medium text-ink">{row.period}</td>
              <td className="px-3 py-2">
                <span className={row.partial ? "text-orange-50" : "text-muted"}>{row.detail}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                <span className="mr-1 text-xs text-muted">{currency}</span>
                <span className="font-semibold">{money(row.cents)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line bg-wash-1/50 px-3 py-2 text-xs text-muted">
        Part months are worked out from the real calendar — the days covered out of that month's own length (28, 29,
        30 or 31), not a flat 30.
      </p>
    </div>
  );
}

/** Days 1-28 (every month has them), plus whatever a record already carries. */
function payDayOptions(existing: number | null): number[] {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return existing && existing > 28 ? [...days, existing] : days;
}

/* ------------------------------------------------------------------- form */

function RecurringFormModal({
  item,
  onClose,
  onSaved,
}: {
  item: RecurringExpense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { activeBusiness } = useBusiness();
  const currency = currencyLabel(activeBusiness);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [type, setType] = useState<ExpenseType>(item?.type ?? "overhead");
  const [form, setForm] = useState({
    label: item?.label ?? "",
    amount: item ? String(item.amount) : "",
    employee_id: item?.employee_id != null ? String(item.employee_id) : "",
    start_date: item?.start_date ?? todayISO(),
    end_date: item?.end_date ?? "",
    pay_day: item?.pay_day != null ? String(item.pay_day) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees(true).then(setEmployees).catch(() => undefined);
  }, []);

  // Picking the person fills in the label and their base salary, so a salary
  // is usually two clicks rather than three fields.
  function handleEmployeeChange(value: string) {
    const employee = employees.find((e) => String(e.id) === value);
    setForm((f) => ({
      ...f,
      employee_id: value,
      label: employee && !f.label ? employee.name : f.label,
      amount: employee?.base_salary != null && !f.amount ? String(employee.base_salary) : f.amount,
    }));
  }

  const endBeforeStart = !!form.end_date && !!form.start_date && form.end_date < form.start_date;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (endBeforeStart) {
      setError("The end date can't be before the start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (item) {
        await updateRecurringExpense(item.id, {
          label: form.label,
          amount: Number(form.amount),
          employee_id: form.employee_id ? Number(form.employee_id) : null,
          end_date: form.end_date || null,
          ...(type === "salary" ? { pay_day: form.pay_day ? Number(form.pay_day) : null } : {}),
        });
      } else {
        const payload: RecurringExpensePayload = {
          type,
          label: form.label,
          amount: Number(form.amount),
          employee_id: type === "salary" && form.employee_id ? Number(form.employee_id) : null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          pay_day: type === "salary" && form.pay_day ? Number(form.pay_day) : null,
        };
        await createRecurringExpense(payload);
      }
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save this fixed cost."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? `Edit "${item.label}"` : "Add a fixed monthly cost"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ---- What is it ---- */}
        <FormSection title="What is it?">
          {!item && (
            <div>
              <RadioGroup
                value={type}
                onChange={(next) => setType(next as ExpenseType)}
                options={[
                  { value: "overhead", label: "Overhead" },
                  { value: "salary", label: "Salary" },
                ]}
              />
              <Helper>
                {type === "salary"
                  ? "A person's monthly pay — added to their record automatically."
                  : "Rent, utilities, subscriptions — anything that repeats every month."}
              </Helper>
            </div>
          )}

          {type === "salary" && (
            <Field label="Employee" icon={UserIcon}>
              <Select
                value={form.employee_id}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                required
                disabled={!!item}
              >
                <option value="">Select an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Short description" icon={FileText}>
            <TextInput
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={type === "salary" ? "e.g. Ahmed — salary" : "e.g. Shop rent"}
              required
              maxLength={200}
            />
            <Helper>Shows on every month's entry.</Helper>
          </Field>
        </FormSection>

        {/* ---- How much ---- */}
        <FormSection title="How much">
          <Field label="Amount per full month" icon={Wallet}>
            <TextInput
              type="number"
              step="any"
              min="0"
              prefix={currency}
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <Helper>What a whole month costs. A part month is charged by the days it covers.</Helper>
          </Field>
        </FormSection>

        {/* ---- When ---- */}
        <FormSection title="When">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" icon={CalendarDays}>
              <TextInput
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                disabled={!!item}
                required
              />
            </Field>
            <Field label="End date (optional)" icon={CalendarDays}>
              <TextInput
                type="date"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </Field>
          </div>
          {endBeforeStart ? (
            <p className="text-xs text-danger">The end date can't be before the start date.</p>
          ) : (
            <Helper>
              {item
                ? "The start date is fixed once set. Leave the end date blank to keep going every month."
                : "Start on any day — the first month is charged from that day to the month's end. Leave the end date blank to keep going every month."}
            </Helper>
          )}

          {type === "salary" && (
            <Field label="Pay day" icon={CalendarDays}>
              <Select value={form.pay_day} onChange={(e) => setForm((f) => ({ ...f, pay_day: e.target.value }))}>
                <option value="">Last day of the month</option>
                {payDayOptions(item?.pay_day ?? null).map((day) => (
                  <option key={day} value={day}>
                    Day {day} of the month
                  </option>
                ))}
              </Select>
              <Helper>
                The day the salary is paid. Admins are alerted then, to confirm any deduction for absent and half days
                before paying.
              </Helper>
            </Field>
          )}

          <ChargePreview
            amount={Number(form.amount)}
            currency={currency}
            start={form.start_date}
            end={endBeforeStart ? "" : form.end_date}
          />
        </FormSection>

        <div className="flex gap-2.5 rounded-lg border border-link/20 bg-link/10 p-3 text-xs leading-relaxed text-muted">
          <Info size={15} className="mt-px shrink-0 text-link" />
          <p>
            {item
              ? "Changing the amount applies from the next month on; months already recorded keep the amount they were charged at. Moving the end date re-works the months around it, except any already paid."
              : "Every month from the start date up to today is added straight away, and each new month follows on its own."}
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <ModalFooter onCancel={onClose} saving={saving} submitLabel={item ? "Save changes" : "Add fixed cost"} />
      </form>
    </Modal>
  );
}

/** A titled group of fields; sections after the first get a divider above them. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Helper text under an input. A span, so it's valid inside a Field's <label>. */
function Helper({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 block text-xs leading-relaxed text-muted">{children}</span>;
}
