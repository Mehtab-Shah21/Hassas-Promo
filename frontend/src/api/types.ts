export type UserRole = "admin" | "employee";

export interface CurrentUser {
  id: number;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  email: string;
  role: UserRole;
  avatar_color: string | null;
  auto_lock_minutes: number;
}

export interface Business {
  id: number;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  cr_no: string | null;
  phone_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  bank_account_name: string | null;
  bank_iban_or_no: string | null;
  bank_swift: string | null;
  bank_name: string | null;
  logo_path: string | null;
  base_currency: string;
  currency_display: string;
  date_format: string;
  timezone: string;
  invoice_prefix: string;
  quotation_prefix: string;
  show_govt_fee_on_invoice: boolean;
  default_vat_rate: number;
  default_invoice_notes_cash: string | null;
  default_invoice_terms_cash: string | null;
  default_invoice_notes_credit: string | null;
  default_invoice_terms_credit: string | null;
  default_quotation_validity_days: number;
  default_quotation_notes: string | null;
  default_quotation_terms: string | null;
  template_config: Record<string, unknown> | null;
  is_active: boolean;
}

export interface FeatureFlag {
  id: number;
  key: string;
  enabled: boolean;
  label: string;
}

export type CustomerType = "individual" | "company";
export type IdKind = "vat_tax" | "national_id";

export interface Customer {
  id: number;
  business_id: number;
  type: CustomerType;
  name: string;
  email: string | null;
  phone_code: string | null;
  phone: string | null;
  parent_customer_id: number | null;
  id_kind: IdKind | null;
  id_value: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface PaginatedCustomers {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface ServiceCategory {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Service {
  id: number;
  business_id: number;
  code: string | null;
  name: string;
  description: string | null;
  price: number;
  govt_fee: number;
  category_id: number | null;
  taxable: boolean;
  is_active: boolean;
}

export interface PaginatedServices {
  items: Service[];
  total: number;
  page: number;
  page_size: number;
}

export type DiscountType = "percent" | "fixed";

export interface Coupon {
  id: number;
  business_id: number;
  code: string;
  discount_type: DiscountType;
  value: number;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

export type TransactionType = "cash" | "credit";
export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "void";

export interface InvoiceItem {
  id: number;
  service_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  govt_fee: number;
  discount: number;
  vat_rate: number;
  line_total: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  method: string;
  paid_on: string;
  reference: string | null;
}

export interface Invoice {
  id: number;
  business_id: number;
  number: string;
  customer_id: number;
  employee_customer_id: number | null;
  transaction_type: TransactionType;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount_total: number;
  coupon_id: number | null;
  vat_total: number;
  govt_fee_total: number;
  grand_total: number;
  amount_paid: number;
  notes: string | null;
  terms: string | null;
  show_bank_details: boolean;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface InvoiceListItem {
  id: number;
  number: string;
  customer_id: number;
  transaction_type: TransactionType;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  grand_total: number;
  amount_paid: number;
}

export interface PaginatedInvoices {
  items: InvoiceListItem[];
  total: number;
  page: number;
  page_size: number;
}

export type AttendanceStatus = "present" | "absent" | "leave";

export interface DayAttendanceEntry {
  user_id: number;
  user_name: string;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface EmployeeTotals {
  user_id: number;
  user_name: string;
  present: number;
  absent: number;
  leave: number;
}

export type ReminderUnit = "day" | "week" | "month";

export interface Reminder {
  id: number;
  offset_value: number;
  offset_unit: ReminderUnit;
}

export interface NotificationListItem {
  id: number;
  customer_id: number;
  customer_name: string;
  service_id: number | null;
  service_name: string;
  note: string | null;
  target_date: string;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  visibility_modules: string[];
  days_remaining: number;
  triggered: boolean;
}

export interface DashboardRecentInvoice {
  id: number;
  number: string;
  customer_name: string;
  invoice_date: string;
  status: string;
  grand_total: number;
}

export interface DashboardTopCustomer {
  customer_id: number;
  customer_name: string;
  total_amount: number;
  invoice_count: number;
}

export interface DashboardSummary {
  period: string;
  total_sales: number;
  invoice_count: number;
  govt_fees_paid_to_date: number;
  vat_collected: number;
  recent_invoices: DashboardRecentInvoice[];
  top_customers: DashboardTopCustomer[];
  attendance_present_today: number | null;
  attendance_absent_today: number | null;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "converted";

export interface Quotation {
  id: number;
  business_id: number;
  number: string;
  customer_id: number;
  employee_customer_id: number | null;
  quotation_date: string;
  validity_days: number;
  valid_until: string;
  status: QuotationStatus;
  subtotal: number;
  discount_total: number;
  coupon_id: number | null;
  vat_total: number;
  govt_fee_total: number;
  grand_total: number;
  notes: string | null;
  terms: string | null;
  show_bank_details: boolean;
  converted_invoice_id: number | null;
  items: InvoiceItem[];
}

export interface QuotationListItem {
  id: number;
  number: string;
  customer_id: number;
  quotation_date: string;
  valid_until: string;
  status: QuotationStatus;
  grand_total: number;
  converted_invoice_id: number | null;
}

export interface PaginatedQuotations {
  items: QuotationListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface InvoiceKpis {
  total_count: number;
  total_amount: number;
  pending_count: number;
  pending_amount: number;
  paid_count: number;
  paid_amount: number;
  overdue_count: number;
  overdue_amount: number;
  void_count: number;
  void_amount: number;
}
