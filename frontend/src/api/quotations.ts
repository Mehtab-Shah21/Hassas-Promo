import { apiClient } from "./client";
import type { InvoiceItemPayload } from "./invoices";
import type { PaginatedQuotations, Quotation, QuotationStatus, TransactionType } from "./types";

export interface QuotationCreatePayload {
  customer_id: number;
  employee_customer_id?: number | null;
  quotation_date: string;
  validity_days?: number | null;
  notes?: string | null;
  terms?: string | null;
  show_bank_details?: boolean;
  coupon_code?: string | null;
  items: InvoiceItemPayload[];
}

export async function createQuotation(payload: QuotationCreatePayload): Promise<Quotation> {
  const res = await apiClient.post<Quotation>("/api/quotations", payload);
  return res.data;
}

export interface ListQuotationsParams {
  search?: string;
  status?: QuotationStatus;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export async function listQuotations(params: ListQuotationsParams): Promise<PaginatedQuotations> {
  const res = await apiClient.get<PaginatedQuotations>("/api/quotations", { params });
  return res.data;
}

export async function getQuotation(id: number): Promise<Quotation> {
  const res = await apiClient.get<Quotation>(`/api/quotations/${id}`);
  return res.data;
}

export async function updateQuotationStatus(id: number, status: QuotationStatus): Promise<Quotation> {
  const res = await apiClient.patch<Quotation>(`/api/quotations/${id}/status`, { status });
  return res.data;
}

export async function convertQuotation(
  id: number,
  transactionType: TransactionType,
): Promise<{ invoice_id: number; invoice_number: string }> {
  const res = await apiClient.post(`/api/quotations/${id}/convert`, null, {
    params: { transaction_type: transactionType },
  });
  return res.data;
}

export async function fetchQuotationPreviewBlob(id: number): Promise<Blob> {
  const res = await apiClient.get(`/api/quotations/${id}/preview`, { responseType: "blob" });
  return res.data;
}

export async function fetchQuotationPdfBlob(id: number): Promise<Blob> {
  const res = await apiClient.get(`/api/quotations/${id}/pdf`, { responseType: "blob" });
  return res.data;
}
