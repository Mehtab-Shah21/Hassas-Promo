import { Route, Routes } from "react-router-dom";
import AdminOnlyRoute from "./components/AdminOnlyRoute";
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
import ReportsPage from "./features/reports/ReportsPage";
import RegionalPage from "./features/settings/pages/RegionalPage";
import ServicesPage from "./features/services/ServicesPage";
import SecurityPage from "./features/settings/pages/SecurityPage";
import SettingsShell from "./features/settings/SettingsShell";
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
        <Route path="quotations" element={<QuotationsListPage />} />
        <Route path="quotations/new" element={<QuotationCreatePage />} />
        <Route path="quotations/:id" element={<QuotationDetailPage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="attendance"
          element={
            <AdminOnlyRoute>
              <AttendancePage />
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reports"
          element={
            <AdminOnlyRoute>
              <ReportsPage />
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
              <DesignStudioPage />
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
