import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    STORAGE_PROVIDER: z.enum(["r2", "mock"]).default("r2"),
    BACKGROUND_API_URL: z.string().optional().default(""),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1),
    WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
    PAYMENT_GATEWAY_NAME: z.string().min(1),
    PAYMENT_GATEWAY_BASE_URL: z.string().optional().default(""),
    PAYMENT_GATEWAY_SECRET: z.string().optional().default(""),
    R2_ACCOUNT_ID: z.string().optional().default(""),
    R2_ACCESS_KEY_ID: z.string().optional().default(""),
    R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
    R2_BUCKET_NAME: z.string().optional().default(""),
    R2_PUBLIC_BASE_URL: z.string().optional().default(""),
    AI_PROVIDER_NAME: z.string().min(1),
    AI_PROVIDER_API_KEY: z.string().optional().default(""),
    ADMIN_JWT_SECRET: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    ALLOWED_ORIGINS: z.string().optional().default("")
  })
  .superRefine((cfg, ctx) => {
    const isManualPayment = cfg.PAYMENT_GATEWAY_NAME === "manual";
    const isMockStorage = cfg.STORAGE_PROVIDER === "mock";
    const isMockAi = cfg.AI_PROVIDER_NAME === "mock";

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

    if (!isMockAi && !cfg.AI_PROVIDER_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_PROVIDER_API_KEY"],
        message: "AI_PROVIDER_API_KEY is required unless AI_PROVIDER_NAME=mock"
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema> & {
  whatsappDryRun: boolean;
  storageDryRun: boolean;
  queueDryRun: boolean;
};

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
  return {
    ...cfg,
    whatsappDryRun: !cfg.WHATSAPP_ACCESS_TOKEN || !cfg.WHATSAPP_PHONE_NUMBER_ID || cfg.WHATSAPP_ACCESS_TOKEN === "replace_me",
    storageDryRun:
      cfg.STORAGE_PROVIDER === "mock" ||
      !cfg.R2_ACCOUNT_ID ||
      !cfg.R2_ACCESS_KEY_ID ||
      !cfg.R2_SECRET_ACCESS_KEY ||
      !cfg.R2_BUCKET_NAME ||
      cfg.R2_ACCESS_KEY_ID === "replace_me",
    queueDryRun: !cfg.REDIS_URL || cfg.REDIS_URL.includes("replace_me")
  };
};

export const getConfigPreview = (config: AppConfig): Record<string, string> => {
  return Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = toSafePreview(key, value);
    return acc;
  }, {});
};
