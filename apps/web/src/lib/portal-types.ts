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
  thumbnailUrl?: string | null;
};

export type CustomerImageQualityScore = {
  id: string;
  providerName: string;
  category: string | null;
  classificationConfidence: number | null;
  pipelineUsed: string | null;
  processingProfile: string | null;
  processingStage: string | null;
  productDetected: boolean;
  confidence: number;
  beforeOverallScore: number | null;
  overallScore: number;
  enhancementScore: number | null;
  enhancementDelta: number | null;
  createdAt: string;
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
  qualityScores?: CustomerImageQualityScore[];
  downloadAllowed?: boolean;
};

export type WebPreviewQuotaResponse = {
  scopeType: "guest" | "account";
  limit: number;
  used: number;
  remaining: number;
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

export type AdminCustomerRecord = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  orders: number;
  walletBalance: number;
  createdAt: string;
};

export type RestorationOrderSummary = {
  id: string;
  orderNo: string;
  title: string | null;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string | null;
};

export type RestorationItemRecord = {
  id: string;
  restorationOrderId: string;
  originalStorageKey: string;
  previewStorageKey: string | null;
  finalStorageKey: string | null;
  originalUrl?: string | null;
  finalUrl?: string | null;
  availableTiers?: string[];
  status: string;
  damageSeverity: string;
  imageCategory: string;
  damageScore: number | null;
  qualityScore: number | null;
  beforeQualityScore: number | null;
  afterQualityScore: number | null;
  beforeBlurScore: number | null;
  afterBlurScore: number | null;
  beforeNoiseScore: number | null;
  afterNoiseScore: number | null;
  beforeSharpnessScore: number | null;
  afterSharpnessScore: number | null;
  beforeBrightnessScore: number | null;
  afterBrightnessScore: number | null;
  beforeContrastScore: number | null;
  afterContrastScore: number | null;
  beforeColorCastScore: number | null;
  afterColorCastScore: number | null;
  faceCount: number | null;
  faceConfidence: number | null;
  qualityRegressionStage: string | null;
  qualityRegressionDetail: string | null;
  processingStage: string | null;
  providerUsed: string | null;
  totalDurationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RestoreUploadResult = {
  item: RestorationItemRecord;
  upload: {
    storageKey: string;
    url: string;
    expiresAt: string;
  };
};

// R9.2-P1A: free upload / original preview / digital fixed-order types.
// Client never sends or trusts an authoritative market/currency/amount --
// these fields are always server-derived/server-owned in the responses below.

// The runtime `as const` arrays below are the single source of truth: each
// union type is derived from its array, so a value can never be valid in one
// place and unknown in the other. UI code that must validate user input at
// runtime (e.g. the admin commerce filter form) imports the array; nothing
// re-declares the literal list a second time.
export const MARKETS = ["PAKISTAN", "INTERNATIONAL"] as const;
export type Market = (typeof MARKETS)[number];

export const FIXED_ORDER_CURRENCIES = ["PKR", "USD"] as const;
export type FixedOrderCurrency = (typeof FIXED_ORDER_CURRENCIES)[number];

export const DIGITAL_TIERS = ["ORIGINAL", "HD_2X", "HD_4X"] as const;
export type DigitalTier = (typeof DIGITAL_TIERS)[number];

export type RestorationDraftRecord = {
  id: string;
  status: "UPLOADED" | "PREVIEW_READY" | "ORDER_SELECTION" | "EXPIRED" | "CANCELLED";
  market: Market | null;
  country: string | null;
  currency: FixedOrderCurrency | null;
  originalMimeType: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  originalFileSizeBytes: number | null;
  previewUrl: string;
  previewExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  /** Present once, only in the create-draft response, for a guest (non-logged-in) upload. */
  guestOwnershipToken?: string;
};

export type DigitalOffer = {
  tier: DigitalTier;
  label: string;
  market: Market;
  currency: FixedOrderCurrency;
  amountMinor: number;
  description: string;
  source: "local_fixture";
};

export type DraftOffersResponse = {
  market: Market;
  currency: FixedOrderCurrency;
  /** `available: false` (with a truthful `reason`) when no approved price exists for this market yet -- never a fabricated offer. */
  offers: DigitalOffer[] | { available: false; reason: string };
};

export type FixedOrderItemRecord = {
  id: string;
  kind: string;
  tierOrSku: string | null;
  quantity: number;
  unitAmountMinor: string;
  totalAmountMinor: string;
  currency: FixedOrderCurrency;
  /** R9.2-P1B pricing provenance -- "local_fixture" is never eligible for payment. */
  pricingSource: string;
  pricingApproved: boolean;
};

export const FIXED_ORDER_TYPES = [
  "RESTORATION_DIGITAL",
  "RESTORATION_WITH_PRINT",
  "DIGITAL_UPGRADE",
  "PRINT_ADD_ON"
] as const;
export type FixedOrderType = (typeof FIXED_ORDER_TYPES)[number];

export const FIXED_ORDER_STATUSES = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_VERIFIED",
  "LOCKED",
  "CANCELLED",
  "EXPIRED"
] as const;
export type FixedOrderStatus = (typeof FIXED_ORDER_STATUSES)[number];

export type FixedOrderRecord = {
  id: string;
  orderNo: string;
  type: FixedOrderType;
  market: Market;
  currency: FixedOrderCurrency;
  totalAmountMinor: string;
  status: FixedOrderStatus;
  immutableAt: string;
  createdAt: string;
  /** Immutable PriceBook snapshot captured at order creation -- null only when the order's pricing did not come from an approved PriceBook (e.g. a fixture offer). Never recomputed after order creation. */
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  items: FixedOrderItemRecord[];
  /** Present once, only in the create-order response, for a guest (non-logged-in) order. */
  guestOwnershipToken?: string;
};

// R9.2-P1B: payment readiness and PaymentAttempt types. The server is always
// the sole source of amount/currency/provider/readiness -- nothing here is
// ever computed or overridden on the client.

export type PaymentReadinessResponse = {
  ready: boolean;
  /** Truthful, human-readable blocker reasons. Empty only when `ready` is true. */
  reasons: string[];
  order: {
    orderNo: string;
    market: Market;
    currency: FixedOrderCurrency;
    totalAmountMinor: string;
    status: string;
  };
};

export const PAYMENT_ATTEMPT_STATUSES = [
  "CREATED",
  "REDIRECT_READY",
  "CUSTOMER_RETURNED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CALLBACK_PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CHARGEBACK"
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export type PaymentAttemptRecord = {
  id: string;
  fixedOrderId: string;
  orderNo: string;
  provider: string;
  status: PaymentAttemptStatus;
  amountMinor: string;
  currency: FixedOrderCurrency;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only present immediately after a successful provider initialization -- never fabricated, never replayed on a later read. */
  checkoutUrl?: string;
};

// R9.2-P2R-ADMIN: read-only admin visibility for FixedOrder/PriceBook/
// PaymentAttempt. These types describe GET-only admin responses -- there is
// no corresponding write/mutation request type because no such endpoint
// exists.

export type AdminCommerceOrderListItem = {
  id: string;
  orderNo: string;
  type: FixedOrderRecord["type"];
  market: Market;
  currency: FixedOrderCurrency;
  totalAmountMinor: string;
  status: string;
  paymentStatus: PaymentAttemptStatus | string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCommerceOrderItemView = {
  id: string;
  kind: string;
  tierOrSku: string | null;
  quantity: number;
  unitAmountMinor: string;
  totalAmountMinor: string;
  currency: FixedOrderCurrency;
  pricingSource: string;
  pricingApproved: boolean;
};

// R9.2-P2R-CUSTOMER-ORDERS: authenticated, read-only customer FixedOrder
// history. GET-only -- there is no corresponding write/mutation request type.

export type CustomerFixedOrderListItem = {
  orderNo: string;
  type: FixedOrderRecord["type"];
  status: string;
  market: Market;
  currency: FixedOrderCurrency;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  items: Array<{
    tierOrSku: string | null;
    pricingSource: string;
    pricingApproved: boolean;
  }>;
  paymentAttempt: { id: string; status: PaymentAttemptStatus | string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFixedOrderListResponse = {
  items: CustomerFixedOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminCommerceOrderDetail = {
  orderNo: string;
  type: FixedOrderRecord["type"];
  status: string;
  market: Market;
  currency: FixedOrderCurrency;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  items: AdminCommerceOrderItemView[];
  paymentReadiness: {
    ready: boolean;
    reasons: string[];
  };
  paymentAttempt: {
    id: string;
    status: string;
    provider: string;
    providerRef: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};
