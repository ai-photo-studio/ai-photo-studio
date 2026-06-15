type PreviewScopeInput = {
  userId?: string | null;
  customerId?: string | null;
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
  isTestAccount: boolean;
  disabled: boolean;
};

const normalizeValue = (value?: string | null) => String(value || "").trim();

const buildScope = (input: PreviewScopeInput) => {
  const userId = normalizeValue(input.userId);
  if (userId) {
    return {
      scopeType: "account" as const,
      scopeKey: `user:${userId}`
    };
  }

  return {
    scopeType: "guest" as const,
    scopeKey: "guest:unlimited"
  };
};

export class PreviewQuotaService {
  async getUnlimitedWebPreview(input: ClaimPreviewInput): Promise<PreviewQuotaResult> {
    const scope = buildScope(input);
    return {
      scopeType: scope.scopeType,
      limit: -1,
      used: 0,
      remaining: -1,
      isTestAccount: false,
      disabled: true
    };
  }
}
