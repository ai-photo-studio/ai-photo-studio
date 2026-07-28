import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { PublicLayout } from "./components/PublicLayout";
import { RequireAdminPortal } from "./components/RequireAdminPortal";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminJobsPage } from "./pages/AdminJobsPage";
import { AdminLogsPage } from "./pages/AdminLogsPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminOrders } from "./pages/AdminOrders";
import { AdminProvidersPage } from "./pages/AdminProvidersPage";
import { AdminSystemPage } from "./pages/AdminSystemPage";
import { AdminRestorationsPage } from "./pages/AdminRestorationsPage";
import { AdminRestorationDetailPage } from "./pages/AdminRestorationDetailPage";
import { FeaturePage } from "./pages/FeaturePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PricingPage } from "./pages/PricingPage";
import { SignupPage } from "./pages/SignupPage";
import { RestoreNewPage } from "./pages/RestoreNewPage";
import { RestoreOrderPage } from "./pages/RestoreOrderPage";
import { RestorationHistoryPage } from "./pages/RestorationHistoryPage";
import { AccountPage } from "./pages/AccountPage";
import { OrdersPage } from "./pages/OrdersPage";
import { WalletPage } from "./pages/WalletPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { CustomerLayout } from "./components/CustomerLayout";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="background-removal" element={<FeaturePage feature="background-removal" />} />
        <Route path="enhancement" element={<FeaturePage feature="enhancement" />} />
        <Route path="flat-lay" element={<FeaturePage feature="flat-lay" />} />
        <Route path="lifestyle" element={<FeaturePage feature="lifestyle" />} />
        <Route path="virtual-model" element={<FeaturePage feature="virtual-model" />} />
        <Route path="videos" element={<FeaturePage feature="videos" />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<SignupPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="restore" element={<RestorationHistoryPage />} />
        <Route path="restore/new" element={<RestoreNewPage />} />
        <Route path="restore/:orderId" element={<RestoreOrderPage />} />
        <Route path="history/restorations" element={<RestorationHistoryPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route element={<CustomerLayout />}>
        <Route path="orders" element={<OrdersPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
      </Route>
      <Route path="admin/login" element={<AdminLoginPage />} />
      <Route
        path="admin"
        element={
          <RequireAdminPortal>
            <AdminLayout />
          </RequireAdminPortal>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="jobs" element={<AdminJobsPage />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="creative-jobs" element={<AdminJobsPage />} />
        <Route path="providers" element={<AdminProvidersPage />} />
        <Route path="metrics" element={<AdminDashboard />} />
        <Route path="logs" element={<AdminLogsPage />} />
        <Route path="audit-logs" element={<AdminLogsPage />} />
        <Route path="system" element={<AdminSystemPage />} />
        <Route path="restorations" element={<AdminRestorationsPage />} />
        <Route path="restorations/:id" element={<AdminRestorationDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
