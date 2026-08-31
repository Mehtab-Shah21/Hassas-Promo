import { apiClient } from "./client";
import type { Invoice, InvoiceKpis, InvoiceStatus, PaginatedInvoices, TransactionType } from "./types";

export interface InvoiceItemPayload {
  service_id?: number | null;
  description?: string;
  qty: number;
  unit_price?: number | null;
  govt_fee?: number | null;
  discount?: number;
  vat_rate?: number | null;
  save_as_service?: boolean;
  category_id?: number | null;
}

export interface InvoiceCreatePayload {
  customer_id: number;
  employee_customer_id?: number | null;
  transaction_type: TransactionType;
  invoice_date: string;
  due_date?: string | null;
  notes?: string | null;
  terms?: string | null;
  show_bank_details?: boolean;
  coupon_code?: string | null;
  items: InvoiceItemPayload[];
}

export async function createInvoice(payload: InvoiceCreatePayload): Promise<Invoice> {
  const res = await apiClient.post<Invoice>("/api/invoices", payload);
  return res.data;
}

export interface ListInvoicesParams {
  search?: string;
  status?: InvoiceStatus;
  overdue_only?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export async function listInvoices(params: ListInvoicesParams): Promise<PaginatedInvoices> {
  const res = await apiClient.get<PaginatedInvoices>("/api/invoices", { params });
  return res.data;
}

export async function getInvoiceKpis(params: { date_from?: string; date_to?: string } = {}): Promise<InvoiceKpis> {
  const res = await apiClient.get<InvoiceKpis>("/api/invoices/kpis", { params });
  return res.data;
}

export async function getInvoice(id: number): Promise<Invoice> {
  const res = await apiClient.get<Invoice>(`/api/invoices/${id}`);
  return res.data;
}

export async function updateInvoiceStatus(id: number, status: InvoiceStatus): Promise<Invoice> {
  const res = await apiClient.patch<Invoice>(`/api/invoices/${id}/status`, { status });
  return res.data;
}

export async function recordPayment(
  id: number,
  payload: { amount: number; method: string; paid_on: string; reference?: string | null },
): Promise<void> {
  await apiClient.post(`/api/invoices/${id}/payments`, payload);
}

export async function fetchInvoicePreviewBlob(id: number): Promise<Blob> {
  const res = await apiClient.get(`/api/invoices/${id}/preview`, { responseType: "blob" });
  return res.data;
}

export async function fetchInvoicePdfBlob(id: number): Promise<Blob> {
  const res = await apiClient.get(`/api/invoices/${id}/pdf`, { responseType: "blob" });
  return res.data;
}
