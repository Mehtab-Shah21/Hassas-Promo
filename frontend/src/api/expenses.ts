import { apiClient } from "./client";
import type { Expense, ExpenseSummary, ExpenseType, PaginatedExpenses } from "./types";

export interface ListExpensesParams {
  type?: ExpenseType | "";
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export async function listExpenses(params: ListExpensesParams): Promise<PaginatedExpenses> {
  const res = await apiClient.get<PaginatedExpenses>("/api/expenses", {
    params: { ...params, type: params.type || undefined },
  });
  return res.data;
}

export async function getExpenseSummary(dateFrom?: string, dateTo?: string): Promise<ExpenseSummary> {
  const res = await apiClient.get<ExpenseSummary>("/api/expenses/summary", {
    params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
  });
  return res.data;
}

export interface ExpensePayload {
  type: ExpenseType;
  amount: number;
  description?: string | null;
  date: string;
  employee_id?: number | null;
  /** Generated fixed costs start unpaid; a hand-entered one-off defaults to paid. */
  is_paid?: boolean;
  paid_on?: string | null;
}

export async function createExpense(payload: ExpensePayload): Promise<Expense> {
  const res = await apiClient.post<Expense>("/api/expenses", payload);
  return res.data;
}

export async function updateExpense(id: number, payload: Partial<ExpensePayload>): Promise<Expense> {
  const res = await apiClient.patch<Expense>(`/api/expenses/${id}`, payload);
  return res.data;
}

export async function deleteExpense(id: number): Promise<void> {
  await apiClient.delete(`/api/expenses/${id}`);
}

export async function uploadExpenseAttachment(id: number, file: File): Promise<Expense> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiClient.post<Expense>(`/api/expenses/${id}/attachment`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
