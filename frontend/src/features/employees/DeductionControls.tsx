import { useState } from "react";

import { confirmDeduction, reopenDeduction, waiveDeduction } from "../../api/salaryDeductions";
import type { DeductionSummary } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { isAdminOrAbove } from "../../utils/roles";

/** 1 -> "1 day", 1.5 -> "1.5 days". */
export function formatDays(days: number): string {
  return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? "day" : "days"}`;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2 absent + 2 half days = 3 days x 100.00" -- the working, in plain words. */
export function deductionWorking(d: DeductionSummary, currency: string): string {
  const parts: string[] = [];
  if (d.absent_days) parts.push(`${d.absent_days} absent`);
  if (d.half_days) parts.push(`${d.half_days} half day${d.half_days === 1 ? "" : "s"}`);
  return `${parts.join(" + ")} = ${formatDays(d.deduction_days)} × ${currency} ${money(d.daily_rate)}`;
}

/** "2026-08-16" -> "August 2026". */
export function monthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The pay date, as "31 Aug". Parsed by hand so it never shifts a day with the timezone. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Confirm / waive / reopen buttons. Only admins and superadmins get them --
 * everyone else sees the status without the controls. Which buttons appear
 * follows the deduction's state, so an impossible action is never offered.
 */
export function DeductionActions({
  expenseId,
  deduction,
  isPaid,
  onChanged,
}: {
  expenseId: number;
  deduction: DeductionSummary;
  isPaid: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdminOrAbove(user?.role)) return null;

  async function run(action: (id: number) => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action(expenseId);
      onChanged();
    } catch (err: unknown) {
      setError(getErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  const base = "rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {deduction.status === "pending" && deduction.can_decide && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => run((id) => confirmDeduction(id), "Could not confirm the deduction.")}
              className={`${base} bg-accent text-ink hover:opacity-90`}
            >
              Confirm deduction
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run((id) => waiveDeduction(id), "Could not waive the deduction.")}
              className={`${base} border border-line hover:bg-wash-1`}
            >
              Don't deduct
            </button>
          </>
        )}
        {(deduction.status === "confirmed" || deduction.status === "waived") && !isPaid && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run((id) => reopenDeduction(id), "Could not reopen the decision.")}
            className={`${base} border border-line text-muted hover:bg-wash-1`}
          >
            Reopen
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
