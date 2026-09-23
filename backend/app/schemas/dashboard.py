from pydantic import BaseModel


class RecentInvoice(BaseModel):
    id: int
    number: str
    customer_name: str
    invoice_date: str
    status: str
    grand_total: float


class TopCustomer(BaseModel):
    customer_id: int
    customer_name: str
    total_amount: float
    invoice_count: int


class SalesTrendPoint(BaseModel):
    label: str
    total_sales: float
    total_expenses: float


class AttendanceTrendPoint(BaseModel):
    label: str
    present: int
    absent: int


class DashboardSummary(BaseModel):
    period: str
    total_sales: float
    invoice_count: int
    govt_fees_paid_to_date: float
    vat_collected: float
    recent_invoices: list[RecentInvoice]
    top_customers: list[TopCustomer]
    attendance_present_today: int | None
    attendance_absent_today: int | None
    # Card/online payments — same figures the Reconciliation page shows.
    # reconciliation_collected follows the dashboard's own period toggle;
    # reconciliation_pending is always all-time (old uncleared payments
    # shouldn't disappear just because they're not from "this period").
    reconciliation_collected: float
    reconciliation_pending: float
    # active_users is a global headcount (user accounts aren't
    # business-scoped), not period-scoped — a live snapshot.
    active_users: int
    # total_expenses reuses services/expenses.py's total_expenses(), scoped
    # to this business + the selected period, same as total_sales.
    total_expenses: float
    # net_revenue = total_sales - total_expenses, computed backend-side in
    # Decimal (see routers/dashboard.py) so the subtraction is exact money
    # math, not float/string arithmetic done client-side.
    net_revenue: float
    # Fixed monthly costs (salaries + overheads set up to repeat). Always
    # "right now" / "this month" regardless of the period toggle — a standing
    # commitment isn't a period figure, and "still to pay this month" is only
    # meaningful for the current month.
    fixed_monthly_cost: float
    fixed_cost_paid_this_month: float
    fixed_cost_pending_this_month: float
    # Fixed windows for the dashboard's charts — independent of the KPI
    # cards' period toggle above, since a trend chart is only useful when
    # it always shows the same lookback regardless of what period is
    # selected for the totals.
    sales_trend: list[SalesTrendPoint]
    attendance_trend: list[AttendanceTrendPoint]
