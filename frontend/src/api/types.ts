export type UserRole = "superadmin" | "admin" | "employee";

export interface CurrentUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  role: UserRole;
  employee_id: number | null;
  // Which company this account is locked to. Always null for superadmin
  // (spans both); always set for admin/employee — see BusinessContext,
  // which forces the active business to this for non-superadmins.
  business_id: number | null;
  avatar_color: string | null;
  auto_lock_minutes: number;
}

export interface AppUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  role: UserRole;
  employee_id: number | null;
  business_id: number | null;
  avatar_color: string | null;
  phone_code: string | null;
  phone: string | null;
  is_active: boolean;
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
  thermal_paper_width: string;
  thermal_template_config: Record<string, unknown> | null;
  is_active: boolean;
}

export interface FeatureFlag {
  id: number;
  business_id: number | null;
  key: string;
  enabled: boolean;
  label: string;
}

export type CustomerType = "individual" | "company";
export type IdKind = "vat_tax" | "national_id";
export type Emirate =
  | "Abu Dhabi"
  | "Dubai"
  | "Sharjah"
  | "Ajman"
  | "Umm Al Quwain"
  | "Fujairah"
  | "Ras Al Khaimah";

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
  emirate: Emirate | null;
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
  max_uses: number | null;
  times_used: number;
}

export type PaymentMethod = "cash" | "card" | "online";
export type ClearedStatus = "pending" | "received";
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
  payment_method: PaymentMethod;
  cleared_status: ClearedStatus;
  received_at: string | null;
}

export interface Invoice {
  id: number;
  business_id: number;
  number: string;
  customer_id: number;
  employee_customer_id: number | null;
  payment_method: PaymentMethod;
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
  payment_method: PaymentMethod;
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

export interface ReconciliationEntry {
  payment_id: number;
  invoice_id: number;
  invoice_number: string;
  customer_name: string;
  payment_method: PaymentMethod;
  amount: number;
  paid_on: string;
  cleared_status: ClearedStatus;
  received_at: string | null;
}

export interface ReconciliationResponse {
  date: string;
  entries: ReconciliationEntry[];
  total_collected: number;
  total_pending: number;
}

export interface Employee {
  id: number;
  business_id: number;
  name: string;
  role: string | null;
  phone_code: string | null;
  phone: string | null;
  base_salary: number | null;
  is_active: boolean;
}

export type AttendanceStatus = "present" | "absent" | "leave";

export interface DayAttendanceEntry {
  employee_id: number;
  employee_name: string;
  status: AttendanceStatus | null;
  note: string | null;
}

export type ExpenseType = "salary" | "overhead" | "company_expense";

// amount/total_amount/total come back from the backend as JSON strings —
// Pydantic serializes Decimal that way by default so precision survives the
// wire (a JSON number would round-trip through a float). Parse with
// Number(...) only where you need to compute; for display the string is
// already formatted to 2 decimals.
export interface Expense {
  id: number;
  business_id: number;
  type: ExpenseType;
  amount: string;
  description: string | null;
  date: string;
  employee_id: number | null;
  employee_name: string | null;
  attachment_path: string | null;
  created_by: number;
}

export interface PaginatedExpenses {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
  total_amount: string;
}

export interface ExpenseSummary {
  total: string;
  by_type: Record<ExpenseType, string>;
}

export interface EmployeeTotals {
  employee_id: number;
  employee_name: string;
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
  reconciliation_collected: number;
  reconciliation_pending: number;
  active_users: number;
  total_expenses: number;
  // net_revenue = total_sales - total_expenses, computed backend-side in
  // Decimal (see routers/dashboard.py) — never recompute this client-side.
  net_revenue: number;
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
