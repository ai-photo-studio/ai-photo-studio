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
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PricingPage } from "./pages/PricingPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { SignupPage } from "./pages/SignupPage";
import { WalletPage } from "./pages/WalletPage";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pricing" element={<PricingPage />} />
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
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="wallets" element={<AdminWalletsPage />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="packages" element={<AdminPackagesPage />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="orders/:id" element={<AdminOrderDetail />} />
        <Route path="failed-jobs" element={<AdminFailedJobs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
