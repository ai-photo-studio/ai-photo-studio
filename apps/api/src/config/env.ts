// Railway production deploy 2026-07-27
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    STORAGE_PROVIDER: z.enum(["r2", "mock"]).default("r2"),
    BACKGROUND_API_URL: z.string().optional().default(""),
    PRODUCT_CLASSIFIER_URL: z.string().optional().default(""),
    REAL_ESRGAN_URL: z.string().optional().default(""),
    IC_LIGHT_LAB_URL: z.string().optional().default(""),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1),
    WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
    PAYMENT_GATEWAY_NAME: z.string().min(1),
    PAYMENT_GATEWAY_BASE_URL: z.string().optional().default(""),
    PAYMENT_GATEWAY_SECRET: z.string().optional().default(""),
    AI_PROVIDER: z.string().optional().default(""),
    AI_PROVIDER_NAME: z.string().optional().default(""),
    PHOTOROOM_API_KEY: z.string().optional().default(""),
    FAL_API_KEY: z.string().optional().default(""),
    FAL_AI_API_KEY: z.string().optional().default(""),
    OPENAI_API_KEY: z.string().optional().default(""),
    REPLICATE_API_TOKEN: z.string().optional().default(""),
    PROVIDER_MODE: z.enum(["automatic", "manual", "benchmark", "shadow"]).default("automatic"),
    YOLO_DETECTOR_URL: z.string().optional().default(""),
    R2_ACCOUNT_ID: z.string().optional().default(""),
    R2_ACCESS_KEY_ID: z.string().optional().default(""),
    R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
    R2_BUCKET_NAME: z.string().optional().default(""),
    R2_PUBLIC_BASE_URL: z.string().optional().default(""),
    R2_ENDPOINT: z.string().optional().default(""),
    AI_PROVIDER_API_KEY: z.string().optional().default(""),
    RESTORATION_ENDPOINT_URL: z.string().optional().default(""),
    RESTORATION_PIPELINE: z.enum(["replicate", "hybrid", "local"]).default("replicate"),
    QUEUE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
    PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(90),
    ABSOLUTE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(150),
    ADMIN_JWT_SECRET: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    DELIVERY_MODE: z.enum(["LOG_ONLY", "WHATSAPP"]).default("LOG_ONLY"),
    ALLOWED_ORIGINS: z.string().optional().default(""),
    REPLICATE_RESTORATION_MODEL_SLUG: z.string().optional().default(""),
    REPLICATE_RESTORATION_MODEL_VERSION: z.string().optional().default(""),
    REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG: z.string().optional().default(""),
    REPLICATE_BACKGROUND_REMOVAL_MODEL_VERSION: z.string().optional().default(""),
    ENABLE_REPLICATE_RESTORATION_PROVIDER: z.string().optional().default(""),
    ENABLE_REPLICATE_BACKGROUND_REMOVAL_PROVIDER: z.string().optional().default(""),
    PHASE1_REPLICATE_ONLY: z.string().optional().default(""),
    RESTORATION_DRY_RUN: z.string().optional().default(""),
    RESTORATION_PROVIDER: z.enum(["replicate", "mock"]).default("replicate"),
     ALLOW_PAID_AI_TESTS: z.string().optional().default("false"),
     ALLOW_UNPAID_DOWNLOADS: z.string().optional().default("false")
     ,GFPGAN_SCALE: z.coerce.number().int().min(1).max(2).default(1),
     RESTORATION_REPLAY_MODE: z.string().optional().default("false"),
     RESTORATION_REPLAY_FIXTURE: z.string().optional().default(""),
     // R9.2-P4C: Bank Alfalah Mastercard Gateway (MPGS) sandbox. Legacy
     // "Alfa APG v1.1" (sandbox.bankalfalah.com / payments.bankalfalah.com,
     // /HS/ endpoints, Store ID/Key1/Key2) is retired and must never be
     // reintroduced here -- see docs/payments/bank-alfalah-mastercard/.
     BANK_ALFALAH_MPGS_ENABLED: z.string().optional().default("false"),
     BANK_ALFALAH_MPGS_BASE_URL: z.string().optional().default("https://test-bankalfalah.gateway.mastercard.com"),
     // R9.2-P4D: bank-confirmed as API V100 for this merchant profile
     // (docs/payments/bank-alfalah-mastercard/
     // P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md) -- prior packets
     // used 74 as standard-pattern-fallback, unconfirmed by the bank.
     BANK_ALFALAH_MPGS_API_VERSION: z.string().optional().default("100"),
     BANK_ALFALAH_MPGS_MERCHANT_ID: z.string().optional().default(""),
     BANK_ALFALAH_MPGS_API_PASSWORD: z.string().optional().default(""),
     // Portal-login metadata ONLY -- never used for REST Basic Auth.
     BANK_ALFALAH_MPGS_OPERATOR_ID: z.string().optional().default(""),
     // The server supplies this to MPGS; it must never be accepted from a
     // browser checkout request. A local loopback URL is used for disposable
     // sandbox runs and production must configure its own approved URL.
     BANK_ALFALAH_MPGS_RETURN_URL: z.string().optional().default(""),
     BANK_ALFALAH_MPGS_CHECKOUT_MODE: z.string().optional().default("hosted_checkout")
  })
  .superRefine((cfg, ctx) => {
    const normalizedPaymentProvider = cfg.PAYMENT_GATEWAY_NAME.trim().toLowerCase();
    const isManualPayment = normalizedPaymentProvider === "manual" || normalizedPaymentProvider === "demo";
    const isMockStorage = cfg.STORAGE_PROVIDER === "mock";
    const selectedAiProvider = (cfg.AI_PROVIDER || cfg.AI_PROVIDER_NAME || "mock").trim().toLowerCase();

    if (!["mock", "local-yolo", "local-rembg", "local-esrgan", "local-iclight", "local-lama", "local-gfpgan", "local-codeformer", "local-ddcolor", "photoroom", "fal", "future-photoroom", "future-falai", "future-replicate"].includes(selectedAiProvider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_PROVIDER"],
        message: "AI_PROVIDER must be one of mock, local-yolo, local-rembg, local-esrgan, local-iclight, photoroom, fal, future-photoroom, future-falai, or future-replicate"
      });
    }

    if (!["jazzcash", "easypaisa", "manual", "demo"].includes(normalizedPaymentProvider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYMENT_GATEWAY_NAME"],
        message: "PAYMENT_GATEWAY_NAME must be one of jazzcash, easypaisa, manual, or demo"
      });
    }

    if (!isManualPayment) {
      if (!cfg.PAYMENT_GATEWAY_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYMENT_GATEWAY_BASE_URL"],
          message: "PAYMENT_GATEWAY_BASE_URL is required unless PAYMENT_GATEWAY_NAME=manual"
        });
      } else {
        try {
          new URL(cfg.PAYMENT_GATEWAY_BASE_URL);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["PAYMENT_GATEWAY_BASE_URL"],
            message: "PAYMENT_GATEWAY_BASE_URL must be a valid URL"
          });
        }
      }

      if (!cfg.PAYMENT_GATEWAY_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYMENT_GATEWAY_SECRET"],
          message: "PAYMENT_GATEWAY_SECRET is required unless PAYMENT_GATEWAY_NAME=manual"
        });
      }
    }

    if (!isMockStorage) {
      const requiredR2Fields: Array<keyof typeof cfg> = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_BASE_URL"
      ];

      for (const field of requiredR2Fields) {
        if (!cfg[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required unless STORAGE_PROVIDER=mock`
          });
        }
      }

      if (cfg.R2_PUBLIC_BASE_URL) {
        try {
          new URL(cfg.R2_PUBLIC_BASE_URL);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["R2_PUBLIC_BASE_URL"],
            message: "R2_PUBLIC_BASE_URL must be a valid URL"
          });
        }
      }
    }

    const mpgsEnabled = cfg.BANK_ALFALAH_MPGS_ENABLED.trim().toLowerCase() === "true";
    if (mpgsEnabled) {
      if (!cfg.BANK_ALFALAH_MPGS_MERCHANT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BANK_ALFALAH_MPGS_MERCHANT_ID"],
          message: "BANK_ALFALAH_MPGS_MERCHANT_ID is required when BANK_ALFALAH_MPGS_ENABLED=true"
        });
      }
      if (!cfg.BANK_ALFALAH_MPGS_API_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BANK_ALFALAH_MPGS_API_PASSWORD"],
          message: "BANK_ALFALAH_MPGS_API_PASSWORD is required when BANK_ALFALAH_MPGS_ENABLED=true"
        });
      }
      try {
        new URL(cfg.BANK_ALFALAH_MPGS_RETURN_URL);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BANK_ALFALAH_MPGS_RETURN_URL"],
          message: "BANK_ALFALAH_MPGS_RETURN_URL must be a valid URL when BANK_ALFALAH_MPGS_ENABLED=true"
        });
      }
      try {
        new URL(cfg.BANK_ALFALAH_MPGS_BASE_URL);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BANK_ALFALAH_MPGS_BASE_URL"],
          message: "BANK_ALFALAH_MPGS_BASE_URL must be a valid URL"
        });
      }
      if (cfg.BANK_ALFALAH_MPGS_CHECKOUT_MODE !== "hosted_checkout") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BANK_ALFALAH_MPGS_CHECKOUT_MODE"],
          message: "BANK_ALFALAH_MPGS_CHECKOUT_MODE must be hosted_checkout (only supported mode in this packet)"
        });
      }
    }

    if (selectedAiProvider === "photoroom" || selectedAiProvider === "fal" || selectedAiProvider === "future-photoroom" || selectedAiProvider === "future-falai" || selectedAiProvider === "future-replicate") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_PROVIDER"],
        message: `AI_PROVIDER ${selectedAiProvider} is disabled for MVP. Use mock, local-yolo, local-rembg, local-esrgan, or local-iclight`
      });
    }

    if (selectedAiProvider === "local-yolo" || selectedAiProvider === "local-rembg") {
      if (!cfg.BACKGROUND_API_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BACKGROUND_API_URL"],
          message: "BACKGROUND_API_URL is required when AI_PROVIDER uses the local pipeline"
        });
      } else {
        // Accept URLs (http/https) or RunPod endpoint IDs (short, no ://, no .)
        const isRunPodEndpointId = cfg.BACKGROUND_API_URL.length < 30
          && !cfg.BACKGROUND_API_URL.includes("://")
          && !cfg.BACKGROUND_API_URL.includes(".");
        if (!isRunPodEndpointId) {
          try {
            new URL(cfg.BACKGROUND_API_URL);
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["BACKGROUND_API_URL"],
              message: "BACKGROUND_API_URL must be a valid URL or a RunPod endpoint ID"
            });
          }
        }
      }

      if (selectedAiProvider === "local-yolo" && !cfg.YOLO_DETECTOR_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["YOLO_DETECTOR_URL"],
          message: "YOLO_DETECTOR_URL is required when AI_PROVIDER=local-yolo"
        });
      } else if (selectedAiProvider === "local-yolo") {
        try {
          new URL(cfg.YOLO_DETECTOR_URL);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["YOLO_DETECTOR_URL"],
            message: "YOLO_DETECTOR_URL must be a valid URL"
          });
        }
      }

      if (!cfg.PRODUCT_CLASSIFIER_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PRODUCT_CLASSIFIER_URL"],
          message: "PRODUCT_CLASSIFIER_URL is required when AI_PROVIDER uses the local pipeline"
        });
      } else {
        try {
          new URL(cfg.PRODUCT_CLASSIFIER_URL);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["PRODUCT_CLASSIFIER_URL"],
            message: "PRODUCT_CLASSIFIER_URL must be a valid URL"
          });
        }
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema> & {
  aiProvider: "mock" | "local-yolo" | "local-rembg" | "local-esrgan" | "local-iclight" | "local-lama" | "local-gfpgan" | "local-codeformer" | "local-ddcolor" | "photoroom" | "fal" | "future-photoroom" | "future-falai" | "future-replicate";
  paymentProvider: "jazzcash" | "easypaisa" | "manual" | "demo";
  whatsappDryRun: boolean;
  storageDryRun: boolean;
  queueDryRun: boolean;
  deliveryMode: "LOG_ONLY" | "WHATSAPP";
  providerMode: "automatic" | "manual" | "benchmark" | "shadow";
  restorationPipeline: "replicate" | "hybrid" | "local";
  restorationDryRun: boolean;
  restorationProvider: "replicate" | "mock";
  allowPaidAiTests: boolean;
  allowUnpaidDownloads: boolean;
  gfpganScale: number;
  restorationReplayMode: boolean;
  restorationReplayFixture: string;
  bankAlfalahMpgs: {
    enabled: boolean;
    baseUrl: string;
    apiVersion: string;
    merchantId: string;
    apiPassword: string;
    operatorId: string;
    returnUrl: string;
    checkoutMode: string;
  };
};

// Helper to create a partial AppConfig with defaults for scripts/benchmarks
export const createMockConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
  NODE_ENV: "development",
  PORT: 4000,
  DATABASE_URL: "postgresql://placeholder",
  REDIS_URL: "redis://placeholder",
  STORAGE_PROVIDER: "mock",
  BACKGROUND_API_URL: "",
  PRODUCT_CLASSIFIER_URL: "",
  REAL_ESRGAN_URL: "",
  IC_LIGHT_LAB_URL: "",
  WHATSAPP_VERIFY_TOKEN: "test",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  PAYMENT_GATEWAY_NAME: "manual",
  PAYMENT_GATEWAY_BASE_URL: "",
  PAYMENT_GATEWAY_SECRET: "",
  AI_PROVIDER: "mock",
  AI_PROVIDER_NAME: "mock",
  PHOTOROOM_API_KEY: "",
  FAL_API_KEY: "",
  FAL_AI_API_KEY: "",
  OPENAI_API_KEY: "",
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
  PROVIDER_MODE: "automatic",
  YOLO_DETECTOR_URL: "",
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "",
  R2_ENDPOINT: "",
  AI_PROVIDER_API_KEY: "",
  RESTORATION_ENDPOINT_URL: process.env.RESTORATION_ENDPOINT_URL || "",
  RESTORATION_PIPELINE: "replicate",
  QUEUE_TIMEOUT_SECONDS: 60,
  PROCESSING_TIMEOUT_SECONDS: 90,
  ABSOLUTE_TIMEOUT_SECONDS: 150,
  ADMIN_JWT_SECRET: "test-admin-jwt",
  JWT_SECRET: "test-jwt",
  DELIVERY_MODE: "LOG_ONLY",
  ALLOWED_ORIGINS: "",
  REPLICATE_RESTORATION_MODEL_SLUG: "",
  REPLICATE_RESTORATION_MODEL_VERSION: "",
  REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG: "",
  REPLICATE_BACKGROUND_REMOVAL_MODEL_VERSION: "",
  ENABLE_REPLICATE_RESTORATION_PROVIDER: "",
  ENABLE_REPLICATE_BACKGROUND_REMOVAL_PROVIDER: "",
  PHASE1_REPLICATE_ONLY: "",
  RESTORATION_DRY_RUN: "",
  RESTORATION_PROVIDER: "replicate",
  ALLOW_PAID_AI_TESTS: "false",
  ALLOW_UNPAID_DOWNLOADS: "false",
  aiProvider: "mock",
  paymentProvider: "manual",
  whatsappDryRun: true,
  storageDryRun: true,
  queueDryRun: true,
  deliveryMode: "LOG_ONLY",
  providerMode: "automatic",
  restorationPipeline: (process.env.RESTORATION_PIPELINE as "replicate" | "hybrid" | "local") || "replicate",
  bankAlfalahMpgs: {
    enabled: false,
    baseUrl: "https://test-bankalfalah.gateway.mastercard.com",
    apiVersion: "74",
    merchantId: "",
    apiPassword: "",
    operatorId: "",
    returnUrl: "",
    checkoutMode: "hosted_checkout"
  },
  ...(overrides || {}),
}) as AppConfig;

const toSafePreview = (key: string, value: string | number | boolean) => {
  if (/secret|token|key|password/i.test(key)) return "[hidden]";
  return String(value);
};

export const loadConfig = (): AppConfig => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const cfg = parsed.data;
  const selectedAiProvider = (cfg.AI_PROVIDER || cfg.AI_PROVIDER_NAME || "mock").trim().toLowerCase();
  const paymentProvider = cfg.PAYMENT_GATEWAY_NAME.trim().toLowerCase();
  const validAiProviders = ["mock", "local-yolo", "local-rembg", "local-esrgan", "local-iclight", "local-lama", "local-gfpgan", "local-codeformer", "local-ddcolor", "photoroom", "fal", "future-photoroom", "future-falai", "future-replicate"];
  return {
    ...cfg,
    aiProvider: (validAiProviders.includes(selectedAiProvider)
      ? selectedAiProvider
      : "mock") as "mock" | "local-yolo" | "local-rembg" | "local-esrgan" | "local-iclight" | "local-lama" | "local-gfpgan" | "local-codeformer" | "local-ddcolor" | "photoroom" | "fal" | "future-photoroom" | "future-falai" | "future-replicate",
    paymentProvider: (["jazzcash", "easypaisa", "manual", "demo"].includes(paymentProvider) ? paymentProvider : "manual") as
      | "jazzcash"
      | "easypaisa"
      | "manual",
    whatsappDryRun: !cfg.WHATSAPP_ACCESS_TOKEN || !cfg.WHATSAPP_PHONE_NUMBER_ID || cfg.WHATSAPP_ACCESS_TOKEN === "replace_me",
    storageDryRun:
      cfg.STORAGE_PROVIDER === "mock" ||
      !cfg.R2_ACCOUNT_ID ||
      !cfg.R2_ACCESS_KEY_ID ||
      !cfg.R2_SECRET_ACCESS_KEY ||
      !cfg.R2_BUCKET_NAME ||
      cfg.R2_ACCESS_KEY_ID === "replace_me",
    queueDryRun: !cfg.REDIS_URL || cfg.REDIS_URL.includes("replace_me"),
    deliveryMode: cfg.DELIVERY_MODE,
    providerMode: cfg.PROVIDER_MODE,
    restorationPipeline: cfg.RESTORATION_PIPELINE,
    restorationDryRun: cfg.RESTORATION_DRY_RUN.trim().toLowerCase() === "true" || cfg.RESTORATION_PROVIDER === "mock",
    restorationProvider: cfg.RESTORATION_PROVIDER,
     allowPaidAiTests: cfg.ALLOW_PAID_AI_TESTS.trim().toLowerCase() === "true",
    allowUnpaidDownloads: cfg.ALLOW_UNPAID_DOWNLOADS.trim().toLowerCase() === "true"
    ,gfpganScale: cfg.GFPGAN_SCALE
    ,restorationReplayMode: cfg.RESTORATION_REPLAY_MODE.trim().toLowerCase() === "true"
    ,restorationReplayFixture: cfg.RESTORATION_REPLAY_FIXTURE.trim()
    ,bankAlfalahMpgs: {
      enabled: cfg.BANK_ALFALAH_MPGS_ENABLED.trim().toLowerCase() === "true",
      baseUrl: cfg.BANK_ALFALAH_MPGS_BASE_URL.trim(),
      apiVersion: cfg.BANK_ALFALAH_MPGS_API_VERSION.trim(),
      merchantId: cfg.BANK_ALFALAH_MPGS_MERCHANT_ID.trim(),
      apiPassword: cfg.BANK_ALFALAH_MPGS_API_PASSWORD,
      operatorId: cfg.BANK_ALFALAH_MPGS_OPERATOR_ID.trim(),
      returnUrl: cfg.BANK_ALFALAH_MPGS_RETURN_URL.trim(),
      checkoutMode: cfg.BANK_ALFALAH_MPGS_CHECKOUT_MODE.trim()
    }
  };
};

export const getConfigPreview = (config: AppConfig): Record<string, string> => {
  return Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== null && typeof value === "object") {
      acc[key] = JSON.stringify(
        Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((inner, [innerKey, innerValue]) => {
          inner[innerKey] = toSafePreview(innerKey, innerValue as string | number | boolean);
          return inner;
        }, {})
      );
    } else {
      acc[key] = toSafePreview(key, value as string | number | boolean);
    }
    return acc;
  }, {});
};
