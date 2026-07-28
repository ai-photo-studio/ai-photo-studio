import { createHash, randomBytes } from "node:crypto";

export const GUEST_OWNERSHIP_HEADER = "x-guest-ownership-token";

export const createGuestOwnershipToken = (): string => randomBytes(32).toString("hex");

export const hashGuestOwnershipToken = (token: string): string =>
  createHash("sha256").update(token.trim()).digest("hex");

export const matchesGuestOwnershipToken = (expectedHash: string | null | undefined, token: string | null | undefined): boolean => {
  if (!expectedHash || !token) return false;
  return hashGuestOwnershipToken(token) === expectedHash;
};

export const readGuestOwnershipToken = (headers: Record<string, unknown>): string | null => {
  const header = headers[GUEST_OWNERSHIP_HEADER] ?? headers[GUEST_OWNERSHIP_HEADER.toUpperCase()];
  if (Array.isArray(header)) return String(header[0] || "").trim() || null;
  return String(header || "").trim() || null;
};
