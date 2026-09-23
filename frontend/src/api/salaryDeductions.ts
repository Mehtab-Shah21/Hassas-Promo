import { apiClient } from "./client";
import type { DeductionSummary, SalaryAlert } from "./types";

/** Salaries that have reached their pay date and are still unpaid (admins only). */
export async function listSalaryAlerts(): Promise<SalaryAlert[]> {
  const res = await apiClient.get<SalaryAlert[]>("/api/salary-deductions/alerts");
  return res.data;
}

/** Take the absence deduction off this salary. */
export async function confirmDeduction(expenseId: number, note?: string): Promise<DeductionSummary> {
  const res = await apiClient.post<DeductionSummary>(`/api/salary-deductions/expense/${expenseId}/confirm`, { note });
  return res.data;
}

/** Decide not to deduct anything this time. */
export async function waiveDeduction(expenseId: number, note?: string): Promise<DeductionSummary> {
  const res = await apiClient.post<DeductionSummary>(`/api/salary-deductions/expense/${expenseId}/waive`, { note });
  return res.data;
}

/** Undo a confirm/waive (while unpaid) so it can be decided again. */
export async function reopenDeduction(expenseId: number): Promise<DeductionSummary> {
  const res = await apiClient.post<DeductionSummary>(`/api/salary-deductions/expense/${expenseId}/reopen`);
  return res.data;
}
