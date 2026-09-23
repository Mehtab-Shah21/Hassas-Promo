import { apiClient } from "./client";
import type { ExpenseType, FixedCostSummary, RecurringExpense } from "./types";

export interface RecurringExpensePayload {
  type: ExpenseType;
  label: string;
  amount: number;
  employee_id?: number | null;
  /** Salaries only: day of the month the pay goes out. Omit/null for the last day of the month. */
  pay_day?: number | null;
  /** First day it applies — any day. The first month is prorated from here. */
  start_date: string;
  /** Last day it applies (inclusive), or null to keep running every month. */
  end_date?: string | null;
}

export async function listRecurringExpenses(includeInactive = true): Promise<RecurringExpense[]> {
  const res = await apiClient.get<RecurringExpense[]>("/api/recurring-expenses", {
    params: { include_inactive: includeInactive },
  });
  return res.data;
}

export async function getFixedCostSummary(): Promise<FixedCostSummary> {
  const res = await apiClient.get<FixedCostSummary>("/api/recurring-expenses/summary");
  return res.data;
}

export async function createRecurringExpense(payload: RecurringExpensePayload): Promise<RecurringExpense> {
  const res = await apiClient.post<RecurringExpense>("/api/recurring-expenses", payload);
  return res.data;
}

export async function updateRecurringExpense(
  id: number,
  payload: Partial<Omit<RecurringExpensePayload, "type" | "start_date">> & { is_active?: boolean },
): Promise<RecurringExpense> {
  const res = await apiClient.patch<RecurringExpense>(`/api/recurring-expenses/${id}`, payload);
  return res.data;
}

/** Stops future months. Never deletes the definition or any month already generated. */
export async function stopRecurringExpense(id: number): Promise<void> {
  await apiClient.delete(`/api/recurring-expenses/${id}`);
}

export async function generateRecurringNow(): Promise<FixedCostSummary> {
  const res = await apiClient.post<FixedCostSummary>("/api/recurring-expenses/generate");
  return res.data;
}
