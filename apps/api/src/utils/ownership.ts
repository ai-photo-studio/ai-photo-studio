// R9.2-P1A: shared ownership check for RestorationDraft/FixedOrder.
//
// Both models share the same ownership shape (`ownerUserId` xor
// `guestOwnershipTokenHash`). Unlike the legacy
// `RestorationController.ensureOrderAccess` (401/403 on mismatch), this
// helper always throws a single, identical 404 for "does not exist" and
// "exists but not yours" -- per this packet's security rule to "reject
// enumeration with consistent not-found behavior" so a caller can never
// distinguish a wrong-owner request from a genuinely missing id.
import type { Request } from "express";
import { AppError } from "./errors";
import { matchesGuestOwnershipToken, readGuestOwnershipToken } from "./guest-ownership";

export interface OwnableRecord {
  ownerUserId?: string | null;
  userId?: string | null;
  guestOwnershipTokenHash: string | null;
}

export interface RequestActor {
  userId?: string;
  guestToken?: string | null;
}

export function actorFromRequest(req: Request): RequestActor {
  return {
    userId: req.user?.sub,
    guestToken: readGuestOwnershipToken(req.headers as Record<string, unknown>)
  };
}

const NOT_FOUND = () => new AppError("Not found", 404, "NOT_FOUND");

/** Throws a uniform 404 unless `record` exists and `actor` is its owner (by user id or guest token). */
export function assertOwnership<T extends OwnableRecord>(record: T | null, actor: RequestActor): T {
  if (!record) throw NOT_FOUND();
  // A verified authenticated identity is authoritative. Do not fall back to
  // a guest token when one is present, or a logged-in unrelated user holding
  // a token could access a guest-owned record.
  if (actor.userId) {
    const ownerUserId = record.ownerUserId ?? record.userId;
    if (ownerUserId && actor.userId === ownerUserId) return record;
    throw NOT_FOUND();
  }
  if (actor.guestToken && matchesGuestOwnershipToken(record.guestOwnershipTokenHash, actor.guestToken)) return record;
  throw NOT_FOUND();
}
