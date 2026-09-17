import { apiClient } from "./client";
import type { ExpenseType } from "./types";

export interface DateRange {
  date_from?: string;
  date_to?: string;
}

// Amounts arrive as 2-dp strings (Decimal on the server), matching the
// Expenses API — see the note on the Expense type.
export interface ExpensesReportRow {
  date: string;
  type: ExpenseType;
  description: string;
  employee: string;
  amount: string;
}
export interface ExpensesReport {
  date_from: string;
  date_to: string;
  total: string;
  by_type: Record<ExpenseType, string>;
  rows: ExpensesReportRow[];
}
export async function getExpensesReport(range: DateRange): Promise<ExpensesReport> {
  const res = await apiClient.get<ExpensesReport>("/api/reports/expenses", { params: range });
  return res.data;
}

export async function downloadCsv(path: string, params: Record<string, unknown>, filename: string) {
  const res = await apiClient.get(path, { params: { ...params, export: "csv" }, responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface SalesSummary {
  date_from: string;
  date_to: string;
  invoice_count: number;
  total_sales: number;
  total_vat: number;
  total_govt_fee: number;
}

export interface SalesByInvoiceRow {
  number: string;
  date: string;
  customer: string;
  type: string;
  status: string;
  total: number;
}

export interface SalesByServiceRow {
  service: string;
  qty: number;
  revenue: number;
}

export async function getSalesSummary(range: DateRange): Promise<SalesSummary> {
  const res = await apiClient.get<SalesSummary>("/api/reports/sales", { params: { view: "summary", ...range } });
  return res.data;
}
export async function getSalesByInvoice(range: DateRange): Promise<SalesByInvoiceRow[]> {
  const res = await apiClient.get<SalesByInvoiceRow[]>("/api/reports/sales", { params: { view: "by_invoice", ...range } });
  return res.data;
}
export async function getSalesByService(range: DateRange): Promise<SalesByServiceRow[]> {
  const res = await apiClient.get<SalesByServiceRow[]>("/api/reports/sales", { params: { view: "by_service", ...range } });
  return res.data;
}

export interface GovtFeesReport {
  date_from: string;
  date_to: string;
  total_govt_fee: number;
  rows: { number: string; date: string; customer: string; govt_fee: number }[];
}
export async function getGovtFeesReport(range: DateRange): Promise<GovtFeesReport> {
  const res = await apiClient.get<GovtFeesReport>("/api/reports/govt-fees", { params: range });
  return res.data;
}

export interface VatReport {
  date_from: string;
  date_to: string;
  total_vat: number;
  rows: { number: string; date: string; customer: string; vat: number }[];
}
export async function getVatReport(range: DateRange): Promise<VatReport> {
  const res = await apiClient.get<VatReport>("/api/reports/vat", { params: range });
  return res.data;
}

export interface OutstandingRow {
  customer: string;
  number: string;
  due_date: string;
  days_overdue: number;
  balance_due: number;
}
export async function getOutstandingReport(): Promise<OutstandingRow[]> {
  const res = await apiClient.get<OutstandingRow[]>("/api/reports/outstanding");
  return res.data;
}

export interface CustomerStatement {
  customer_id: number;
  customer_name: string;
  billed_total: number;
  paid_total: number;
  outstanding_total: number;
  rows: { number: string; date: string; billed: number; paid: number; outstanding: number }[];
}
export async function getCustomerStatement(customerId: number): Promise<CustomerStatement> {
  const res = await apiClient.get<CustomerStatement>("/api/reports/customer-statement", { params: { customer_id: customerId } });
  return res.data;
}

export interface ServicePerformanceRow {
  service: string;
  count: number;
  revenue: number;
}
export async function getServicePerformance(range: DateRange): Promise<ServicePerformanceRow[]> {
  const res = await apiClient.get<ServicePerformanceRow[]>("/api/reports/service-performance", { params: range });
  return res.data;
}

export interface QuotationsReport {
  counts: { created: number; accepted: number; converted: number; pending: number; rejected: number };
  rows: { number: string; date: string; customer: string; status: string; total: number }[];
}
export async function getQuotationsReport(range: DateRange): Promise<QuotationsReport> {
  const res = await apiClient.get<QuotationsReport>("/api/reports/quotations", { params: range });
  return res.data;
}

export interface AttendanceSummaryRow {
  employee: string;
  present: number;
  absent: number;
  leave: number;
}
export async function getAttendanceSummaryReport(range: DateRange): Promise<AttendanceSummaryRow[]> {
  const res = await apiClient.get<AttendanceSummaryRow[]>("/api/reports/attendance-summary", { params: range });
  return res.data;
}
