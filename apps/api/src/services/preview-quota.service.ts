import { createHash } from "node:crypto";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";

type PreviewScopeInput = {
  userId?: string | null;
  previewClientId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ClaimPreviewInput = PreviewScopeInput & {
  fileName?: string;
  contentType?: string;
};

type PreviewQuotaResult = {
  scopeType: "guest" | "account";
  limit: number;
  used: number;
  remaining: number;
};

const GUEST_LIMIT = 1;
const ACCOUNT_LIMIT = 3;

const normalizeValue = (value?: string | null) => String(value || "").trim();

const hashScope = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

const buildScope = (input: PreviewScopeInput) => {
  const userId = normalizeValue(input.userId);
  if (userId) {
    return {
      scopeType: "account" as const,
      scopeKey: `user:${userId}`,
      limit: ACCOUNT_LIMIT
    };
  }

  const previewClientId = normalizeValue(input.previewClientId);
  const ipAddress = normalizeValue(input.ipAddress);
  const userAgent = normalizeValue(input.userAgent);
  const scopeSeed = previewClientId || `${ipAddress}|${userAgent}` || "guest";
  return {
    scopeType: "guest" as const,
    scopeKey: `guest:${hashScope(scopeSeed)}`,
    limit: GUEST_LIMIT
  };
};

export class PreviewQuotaService {
  async claimWebPreview(input: ClaimPreviewInput): Promise<PreviewQuotaResult> {
    const scope = buildScope(input);
    const settingKey = `free-preview:${scope.scopeKey}`;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.setting.findUnique({ where: { key: settingKey } });
      let currentValue = 0;
      if (existing) {
        try {
          currentValue = Number(JSON.parse(existing.value || "{}").used || 0);
        } catch {
          currentValue = Number(existing.value) || 0;
        }
      }

      if (currentValue >= scope.limit) {
        throw new AppError(
          scope.scopeType === "account"
            ? "You have reached the free preview limit for this account"
            : "You have reached the free preview limit for this device",
          429,
          "FREE_PREVIEW_LIMIT_REACHED"
        );
      }

      const nextValue = currentValue + 1;
      const payload = {
        used: nextValue,
        limit: scope.limit,
        scopeType: scope.scopeType,
        updatedAt: new Date().toISOString(),
        fileName: normalizeValue(input.fileName) || null,
        contentType: normalizeValue(input.contentType) || null
      };

      await tx.setting.upsert({
        where: { key: settingKey },
        update: {
          value: JSON.stringify(payload),
          description: `Preview quota for ${scope.scopeType}`,
          updatedBy: input.userId || input.previewClientId || input.ipAddress || "system"
        },
        create: {
          key: settingKey,
          value: JSON.stringify(payload),
          description: `Preview quota for ${scope.scopeType}`,
          updatedBy: input.userId || input.previewClientId || input.ipAddress || "system"
        }
      });

      return {
        scopeType: scope.scopeType,
        limit: scope.limit,
        used: nextValue,
        remaining: Math.max(0, scope.limit - nextValue)
      };
    });
  }
}