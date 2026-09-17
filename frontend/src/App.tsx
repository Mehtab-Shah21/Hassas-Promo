import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AdminOnlyRoute from "./components/AdminOnlyRoute";
import FeatureGate from "./components/FeatureGate";
import ProtectedRoute from "./components/ProtectedRoute";
import { BusinessProvider } from "./context/BusinessContext";
import { FeatureFlagsProvider } from "./context/FeatureFlagsContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import LoginPage from "./features/auth/LoginPage";
import AttendancePage from "./features/attendance/AttendancePage";
import CouponsPage from "./features/coupons/CouponsPage";
import CustomerDetailPage from "./features/customers/CustomerDetailPage";
import CustomersListPage from "./features/customers/CustomersListPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import ExpensesPage from "./features/expenses/ExpensesPage";
import InvoiceCreatePage from "./features/invoices/InvoiceCreatePage";
import InvoiceDetailPage from "./features/invoices/InvoiceDetailPage";
import InvoicesListPage from "./features/invoices/InvoicesListPage";
import NotificationsPage from "./features/notifications/NotificationsPage";
import QuotationCreatePage from "./features/quotations/QuotationCreatePage";
import QuotationDetailPage from "./features/quotations/QuotationDetailPage";
import QuotationsListPage from "./features/quotations/QuotationsListPage";
import ReconciliationPage from "./features/reconciliation/ReconciliationPage";
import ServicesPage from "./features/services/ServicesPage";
import UsersPage from "./features/users/UsersPage";
import AppShell from "./layouts/AppShell";

// Split out of the main bundle: each of these is reached far less often than
// the daily invoicing/customer workflow above (Design Studio and the Settings
// sub-pages are admin-only configuration screens, Reports/Audit Log are
// periodic lookups) -- there's no reason their code, and DesignStudioPage's
// especially, should be downloaded and parsed on every app load, including
// the very first thing a new employee's browser has to fetch before they can
// even sign in and create an invoice.
const AuditLogPage = lazy(() => import("./features/audit/AuditLogPage"));
const DesignStudioPage = lazy(() => import("./features/design-studio/DesignStudioPage"));
const ReportsPage = lazy(() => import("./features/reports/ReportsPage"));
const SettingsShell = lazy(() => import("./features/settings/SettingsShell"));
const BackupPage = lazy(() => import("./features/settings/pages/BackupPage"));
const CompanyProfilePage = lazy(() => import("./features/settings/pages/CompanyProfilePage"));
const FeatureFlagsPage = lazy(() => import("./features/settings/pages/FeatureFlagsPage"));
const InvoiceDefaultsPage = lazy(() => import("./features/settings/pages/InvoiceDefaultsPage"));
const PrintSettingsPage = lazy(() => import("./features/settings/pages/PrintSettingsPage"));
const QuotationDefaultsPage = lazy(() => import("./features/settings/pages/QuotationDefaultsPage"));
const RegionalPage = lazy(() => import("./features/settings/pages/RegionalPage"));
const SecurityPage = lazy(() => import("./features/settings/pages/SecurityPage"));

function RouteLoadingFallback() {
  return <p className="p-6 text-sm text-muted">Loading...</p>;
}

function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <BusinessProvider>
              <FeatureFlagsProvider>
                <NotificationsProvider>
                  <AppShell />
                </NotificationsProvider>
              </FeatureFlagsProvider>
            </BusinessProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="invoices" element={<InvoicesListPage />} />
        <Route path="invoices/new" element={<InvoiceCreatePage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route
          path="quotations"
          element={
            <FeatureGate flag="quotations" label="Quotations">
              <QuotationsListPage />
            </FeatureGate>
          }
        />
        <Route
          path="quotations/new"
          element={
            <FeatureGate flag="quotations" label="Quotations">
              <QuotationCreatePage />
            </FeatureGate>
          }
        />
        <Route
          path="quotations/:id"
          element={
            <FeatureGate flag="quotations" label="Quotations">
              <QuotationDetailPage />
            </FeatureGate>
          }
        />
        <Route
          path="coupons"
          element={
            <FeatureGate flag="coupons" label="Coupons">
              <CouponsPage />
            </FeatureGate>
          }
        />
        <Route
          path="notifications"
          element={
            <FeatureGate flag="notifications" label="Notifications">
              <NotificationsPage />
            </FeatureGate>
          }
        />
        <Route
          path="attendance"
          element={
            <AdminOnlyRoute minRole="manager">
              <FeatureGate flag="attendance" label="Attendance">
                <AttendancePage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reconciliation"
          element={
            <AdminOnlyRoute minRole="manager">
              <FeatureGate flag="reconciliation" label="Reconciliation">
                <ReconciliationPage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reports"
          element={
            <AdminOnlyRoute minRole="manager">
              <FeatureGate flag="reports" label="Reports">
                <ReportsPage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <AdminOnlyRoute minRole="manager">
              <ExpensesPage />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="audit-log"
          element={
            <AdminOnlyRoute minRole="manager">
              <AuditLogPage />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="design-studio"
          element={
            <AdminOnlyRoute>
              <FeatureGate flag="design_studio" label="Design Studio">
                <DesignStudioPage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminOnlyRoute>
              <UsersPage />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="settings"
          element={
            <AdminOnlyRoute>
              <SettingsShell />
            </AdminOnlyRoute>
          }
        >
          <Route index element={<CompanyProfilePage />} />
          <Route path="regional" element={<RegionalPage />} />
          <Route path="invoice-defaults" element={<InvoiceDefaultsPage />} />
          <Route path="quotation-defaults" element={<QuotationDefaultsPage />} />
          <Route path="print" element={<PrintSettingsPage />} />
          <Route path="features" element={<FeatureFlagsPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="backup" element={<BackupPage />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}

export default App;
