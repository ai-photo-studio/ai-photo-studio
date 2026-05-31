import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  PAYMENT_GATEWAY_NAME: z.string().min(1),
  PAYMENT_GATEWAY_BASE_URL: z.string().url(),
  PAYMENT_GATEWAY_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  AI_PROVIDER_NAME: z.string().min(1),
  AI_PROVIDER_API_KEY: z.string().min(1),
  ADMIN_JWT_SECRET: z.string().min(1)
});

export type AppConfig = z.infer<typeof envSchema> & {
  whatsappDryRun: boolean;
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
    whatsappDryRun: !cfg.WHATSAPP_ACCESS_TOKEN || !cfg.WHATSAPP_PHONE_NUMBER_ID
  };
};

export const getConfigPreview = (config: AppConfig): Record<string, string> => {
  return Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = toSafePreview(key, value);
    return acc;
  }, {});
};
