import { Route, Routes } from "react-router-dom";
import AdminOnlyRoute from "./components/AdminOnlyRoute";
import FeatureGate from "./components/FeatureGate";
import ProtectedRoute from "./components/ProtectedRoute";
import { BusinessProvider } from "./context/BusinessContext";
import { FeatureFlagsProvider } from "./context/FeatureFlagsContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import LoginPage from "./features/auth/LoginPage";
import AttendancePage from "./features/attendance/AttendancePage";
import AuditLogPage from "./features/audit/AuditLogPage";
import CouponsPage from "./features/coupons/CouponsPage";
import CustomerDetailPage from "./features/customers/CustomerDetailPage";
import CustomersListPage from "./features/customers/CustomersListPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import DesignStudioPage from "./features/design-studio/DesignStudioPage";
import ExpensesPage from "./features/expenses/ExpensesPage";
import InvoiceCreatePage from "./features/invoices/InvoiceCreatePage";
import InvoiceDetailPage from "./features/invoices/InvoiceDetailPage";
import InvoicesListPage from "./features/invoices/InvoicesListPage";
import BackupPage from "./features/settings/pages/BackupPage";
import CompanyProfilePage from "./features/settings/pages/CompanyProfilePage";
import FeatureFlagsPage from "./features/settings/pages/FeatureFlagsPage";
import InvoiceDefaultsPage from "./features/settings/pages/InvoiceDefaultsPage";
import PrintSettingsPage from "./features/settings/pages/PrintSettingsPage";
import QuotationDefaultsPage from "./features/settings/pages/QuotationDefaultsPage";
import NotificationsPage from "./features/notifications/NotificationsPage";
import QuotationCreatePage from "./features/quotations/QuotationCreatePage";
import QuotationDetailPage from "./features/quotations/QuotationDetailPage";
import QuotationsListPage from "./features/quotations/QuotationsListPage";
import ReconciliationPage from "./features/reconciliation/ReconciliationPage";
import ReportsPage from "./features/reports/ReportsPage";
import RegionalPage from "./features/settings/pages/RegionalPage";
import ServicesPage from "./features/services/ServicesPage";
import SecurityPage from "./features/settings/pages/SecurityPage";
import SettingsShell from "./features/settings/SettingsShell";
import UsersPage from "./features/users/UsersPage";
import AppShell from "./layouts/AppShell";

function App() {
  return (
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
            <AdminOnlyRoute>
              <FeatureGate flag="attendance" label="Attendance">
                <AttendancePage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reconciliation"
          element={
            <AdminOnlyRoute>
              <FeatureGate flag="reconciliation" label="Reconciliation">
                <ReconciliationPage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reports"
          element={
            <AdminOnlyRoute>
              <FeatureGate flag="reports" label="Reports">
                <ReportsPage />
              </FeatureGate>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <AdminOnlyRoute>
              <ExpensesPage />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="audit-log"
          element={
            <AdminOnlyRoute>
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
  );
}

export default App;
