import type { AuthUser, PackageSummary, PaginatedResponse } from "./api";

export type PortalUser = AuthUser;

export type PortalWalletTransaction = {
  id: string;
  type: string;
  state: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  payment?: {
    id: string;
    provider: string;
    status: string;
    checkoutUrl: string | null;
    providerRef: string | null;
    screenshotPath: string | null;
    reviewNotes: string | null;
  } | null;
  order?: {
    id: string;
    orderNo: string;
    orderStatus: string;
    paymentStatus: string;
  } | null;
  subscription?: {
    id: string;
    planCode: string;
    status: string;
    package?: {
      code: string;
      name: string;
    } | null;
  } | null;
};

export type PortalSubscriptionUsage = {
  id: string;
  periodStart: string;
  periodEnd: string;
  creditsReserved: number;
  creditsSpent: number;
  creditsReleased: number;
  jobsReserved: number;
  jobsCompleted: number;
  jobsFailed: number;
};

export type PortalSubscriptionRecord = {
  id: string;
  planCode: string;
  status: string;
  monthlyCreditLimit: number;
  monthlyCreditsUsed: number;
  monthlyCreditsReserved: number;
  periodStart: string;
  periodEnd: string;
  nextResetAt: string;
  lastResetAt: string | null;
  startedAt: string;
  endedAt: string | null;
  package: {
    id?: string;
    code: string;
    name: string;
    description: string | null;
    workflowType: string;
    workflowMode: string;
  };
  wallet: {
    id: string;
    balance: number;
    reservedBalance: number;
    lifetimeSpent: number;
    lifetimeCredited: number;
    currency: string;
  };
  usage: PortalSubscriptionUsage[];
};

export type PortalWallet = {
  id: string;
  userId: string;
  balance: number;
  reservedBalance: number;
  lifetimeSpent: number;
  lifetimeCredited: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  availableBalance: number;
  transactions: PortalWalletTransaction[];
  subscriptions: PortalSubscriptionRecord[];
};

export type CustomerWalletResponse = {
  user: PortalUser;
  wallet: PortalWallet;
  summary: {
    availableBalance: number;
    totalTransactions: number;
    activeSubscriptions: number;
    lifetimeSpent: number;
    lifetimeCredited: number;
    pendingPayments: number;
  };
  activeSubscription: PortalSubscriptionRecord | null;
};

export type PortalOrderPayment = {
  id: string;
  provider: string;
  providerRef: string | null;
  checkoutUrl: string | null;
  status: string;
  amount: string | number;
  currency: string;
  screenshotPath: string | null;
  screenshotStorageKey: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type CustomerPaymentRecord = {
  id: string;
  orderNo: string;
  package: PackageSummary;
  customer: {
    id: string;
    whatsappNumber: string;
    name: string | null;
  };
  orderStatus: string;
  paymentStatus: string;
  total: number;
  currency: string;
  createdAt: string;
  latestPayment: PortalOrderPayment | null;
  pendingProof: PortalOrderPayment | null;
  paymentHistory: PortalOrderPayment[];
};

export type CustomerPaymentsResponse = PaginatedResponse<CustomerPaymentRecord> & {
  user: PortalUser;
  pendingPayments: number;
};

export type CustomerSubscriptionResponse = PaginatedResponse<PortalSubscriptionRecord> & {
  user: PortalUser;
  activeSubscription: PortalSubscriptionRecord | null;
  currentUsage: PortalSubscriptionUsage | null;
  summary: {
    planCode: string;
    planName: string;
    monthlyCreditLimit: number;
    monthlyCreditsUsed: number;
    monthlyCreditsReserved: number;
    remainingCredits: number;
    nextResetAt: string;
    periodStart: string;
    periodEnd: string;
  } | null;
};

export type CustomerOrderImage = {
  id: string;
  kind: string;
  storageKey: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CustomerOrderStatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: string;
  reason: string | null;
  createdAt: string;
};

export type CustomerProcessingJob = {
  id: string;
  queueName: string;
  jobName: string;
  providerName: string | null;
  workflowType: string | null;
  workflowMode: string | null;
  status: string;
  attempts: number;
  queueJobId: string | null;
  errorMessage: string | null;
  deadLetterReason: string | null;
  failureStage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrderResponse = {
  id: string;
  orderNo: string;
  orderStatus: string;
  paymentStatus: string;
  subtotal: number | string;
  total: number | string;
  currency: string;
  notes: string | null;
  originalStorageKey: string | null;
  originalUrl: string | null;
  originalExpiresAt: string | null;
  processedStorageKey: string | null;
  processedUrl: string | null;
  processedExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    whatsappNumber: string;
    name: string | null;
  };
  user: PortalUser | null;
  package: PackageSummary;
  images: CustomerOrderImage[];
  payments: PortalOrderPayment[];
  statusHistory: CustomerOrderStatusEvent[];
  processingJobs: CustomerProcessingJob[];
};

export type AdminDashboardResponse = {
  todayOrders: number;
  todayRevenue: number | string;
  pendingPayments: number;
  processingOrders: number;
  completedOrders: number;
  failedOrders: number;
  failedJobs: number;
  imagesProcessedToday: number;
};

export type AdminStatsResponse = {
  totals: {
    totalJobs: number;
    queuedJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    retryingJobs: number;
    deadLetterJobs: number;
  };
  failureTracking: {
    providerFailures: number;
    queueFailures: number;
  };
  queueDepth: number;
  activeWorkers: number;
  performance: {
    averageProcessingDurationMs: number;
    completedJobsMeasured: number;
  };
  commercial: {
    paymentApprovals: number;
    pendingPayments: number;
    walletCount: number;
    totalWalletBalance: number;
    totalWalletReserved: number;
    totalLifetimeSpent: number;
    totalLifetimeCredited: number;
  };
  providerBreakdown: Array<{
    providerName: string;
    count: number;
  }>;
};

export type AdminPaymentRecord = {
  id: string;
  provider: string;
  providerRef: string | null;
  checkoutUrl: string | null;
  status: string;
  amount: string | number;
  currency: string;
  screenshotPath: string | null;
  screenshotStorageKey: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNo: string;
    orderStatus: string;
    paymentStatus: string;
    total: string | number;
    currency: string;
    customer: {
      whatsappNumber: string;
      name: string | null;
    };
    package: {
      code: string;
      name: string;
      price: string | number;
      currency: string;
    };
    user: {
      email: string;
      name: string | null;
    } | null;
  };
  walletTransactions: Array<{
    id: string;
    type: string;
    state: string;
    amount: number;
    createdAt: string;
  }>;
};

export type AdminWalletRecord = {
  id: string;
  userId: string;
  balance: number;
  reservedBalance: number;
  lifetimeSpent: number;
  lifetimeCredited: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  user: PortalUser;
  transactions: PortalWalletTransaction[];
  subscriptions: PortalSubscriptionRecord[];
};

export type AdminSubscriptionRecord = PortalSubscriptionRecord & {
  user: PortalUser;
};
