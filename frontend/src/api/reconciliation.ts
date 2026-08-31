import { apiClient } from "./client";
import type { ReconciliationResponse } from "./types";

export async function getReconciliation(date: string): Promise<ReconciliationResponse> {
  const res = await apiClient.get<ReconciliationResponse>("/api/reconciliation", { params: { date } });
  return res.data;
}

export async function markPaymentReceived(paymentId: number): Promise<void> {
  await apiClient.post(`/api/reconciliation/payments/${paymentId}/receive`);
}
