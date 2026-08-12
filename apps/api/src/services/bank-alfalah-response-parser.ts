export type ApgResponseShape = {
  body: Record<string, unknown>;
  bodyType: string;
  depth: number;
};

export function parseApgResponse(text: string, maxDepth = 3): ApgResponseShape {
  let value: unknown = text;
  let depth = 0;
  for (; depth < maxDepth; depth += 1) {
    if (typeof value !== "string") break;
    try {
      value = JSON.parse(value);
    } catch {
      const raw = typeof value === "string" ? value : "";
      return { body: {}, bodyType: raw.length === 0 ? "empty" : /<html[\s>]/i.test(raw) ? "html" : "string", depth };
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { body: value as Record<string, unknown>, bodyType: "json-object", depth };
  }
  if (Array.isArray(value)) return { body: {}, bodyType: "json-array", depth };
  return { body: {}, bodyType: `json-${typeof value}`, depth };
}

export function sanitizeApgMessage(value: unknown): string {
  if (typeof value !== "string") return "ABSENT";
  return value.replace(/[^A-Za-z0-9 .,;:_()/-]/g, "").slice(0, 160) || "ABSENT";
}
