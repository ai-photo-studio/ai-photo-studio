import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { CustomerLayout } from "./components/CustomerLayout";
import { PublicLayout } from "./components/PublicLayout";
import { RequireAuth } from "./components/RequireAuth";
import { AccountPage } from "./pages/AccountPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminFailedJobs } from "./pages/AdminFailedJobs";
import { AdminOrderDetail } from "./pages/AdminOrderDetail";
import { AdminOrders } from "./pages/AdminOrders";
import { AdminPackagesPage } from "./pages/AdminPackagesPage";
import { AdminPaymentsPage } from "./pages/AdminPaymentsPage";
import { AdminSubscriptionsPage } from "./pages/AdminSubscriptionsPage";
import { AdminWalletsPage } from "./pages/AdminWalletsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminJobsPage } from "./pages/AdminJobsPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminLogsPage } from "./pages/AdminLogsPage";
import { AdminProvidersPage } from "./pages/AdminProvidersPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminStoragePage } from "./pages/AdminStoragePage";
import { AdminSystemPage } from "./pages/AdminSystemPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PricingPage } from "./pages/PricingPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { SignupPage } from "./pages/SignupPage";
import { WalletPage } from "./pages/WalletPage";
import { BackgroundRemovalPage } from "./pages/BackgroundRemovalPage";
import { FlatLayPage } from "./pages/FlatLayPage";
import { LifestyleScenesPage } from "./pages/LifestyleScenesPage";
import { VirtualModelsPage } from "./pages/VirtualModelsPage";
import { ProductVideosPage } from "./pages/ProductVideosPage";
import { FeaturesPage } from "./pages/FeaturesPage";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="features" element={<FeaturesPage />} />
        <Route path="background-removal" element={<BackgroundRemovalPage />} />
        <Route path="flat-lay" element={<FlatLayPage />} />
        <Route path="lifestyle-scenes" element={<LifestyleScenesPage />} />
        <Route path="virtual-models" element={<VirtualModelsPage />} />
        <Route path="product-videos" element={<ProductVideosPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<CustomerLayout />}>
          <Route index element={<Navigate to="/orders" replace />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        <Route path="/admin/orders/:id" element={<AdminOrderDetail />} />
        <Route path="/admin/payments" element={<AdminPaymentsPage />} />
        <Route path="/admin/wallets" element={<AdminWalletsPage />} />
        <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="/admin/packages" element={<AdminPackagesPage />} />
        <Route path="/admin/jobs" element={<AdminJobsPage />} />
        <Route path="/admin/providers" element={<AdminProvidersPage />} />
        <Route path="/admin/storage" element={<AdminStoragePage />} />
        <Route path="/admin/logs" element={<AdminLogsPage />} />
        <Route path="/admin/system" element={<AdminSystemPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/failed-jobs" element={<AdminFailedJobs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}