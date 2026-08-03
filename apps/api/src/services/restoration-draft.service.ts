// R9.2-P1A: free upload, validation, persistence, and protected preview for
// RestorationDraft. No Replicate/RunPod/payment call is made anywhere in
// this file -- it only decodes/validates bytes, stores them, and persists
// metadata.
import type { RestorationDraft } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { StorageService } from "./storage.service";
import {
  assertSafeUploadFileName,
  decodeDraftImageBase64,
  validateRestorationDraftImage
} from "../domain/restorationDraft/imageValidation";
import { assertMarketConfirmed, deriveMarketFromCountry } from "../domain/restorationDraft/market";
import { createGuestOwnershipToken, hashGuestOwnershipToken } from "../utils/guest-ownership";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import type { OfferProvider } from "../domain/pricing/offerProvider";
import { ApprovedOfferProvider } from "../domain/pricing/approvedOfferProvider";

export interface CreateDraftInput {
  country: string;
  marketConfirmed: boolean;
  fileName: string;
  contentType?: string;
  bodyBase64: string;
  actorUserId?: string;
}

export interface DraftSafeView {
  id: string;
  status: string;
  market: string | null;
  country: string | null;
  currency: string | null;
  originalMimeType: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  originalFileSizeBytes: number | null;
  previewUrl: string;
  previewExpiresAt: string;
  createdAt: Date;
  updatedAt: Date;
}

const PREVIEW_SIGNED_URL_TTL_MS = 15 * 60 * 1000; // matches StorageService's hardcoded 15-minute presign window

export class RestorationDraftService {
  private readonly storage: StorageService;
  private readonly offers: OfferProvider;

  // R9.2-P1C-B: default provider matches FixedOrderService's -- the price a
  // customer is shown here must always be the same PriceBook entry that
  // order creation will later snapshot, never a separately-drifting source.
  constructor(config: AppConfig, offers: OfferProvider = new ApprovedOfferProvider()) {
    this.storage = new StorageService(config);
    this.offers = offers;
  }

  async createDraft(input: CreateDraftInput): Promise<{ draft: DraftSafeView; guestOwnershipToken?: string }> {
    // Market is always server-derived from a raw country code + an explicit
    // confirmation flag -- the client never sends an authoritative market or
    // currency value directly.
    assertMarketConfirmed(input.marketConfirmed);
    const derivedMarket = deriveMarketFromCountry(input.country);

    if (!input.fileName || !input.bodyBase64) {
      throw new AppError("fileName and bodyBase64 are required", 400, "INVALID_REQUEST");
    }

    // Untrusted client text is bounded/sanitized, and the base64 payload's
    // shape is validated, BEFORE any buffer allocation, storage write, or DB
    // write happens.
    const fileName = assertSafeUploadFileName(input.fileName);
    const body = decodeDraftImageBase64(input.bodyBase64);
    // Verified by decode (magic bytes + real sharp metadata read), never by
    // the client-declared contentType/extension alone.
    const validated = await validateRestorationDraftImage(body);

    const uploadResult = await this.storage.uploadOriginal({
      fileName,
      body,
      contentType: validated.mimeType
    });

    let guestOwnershipToken: string | undefined;
    let guestOwnershipTokenHash: string | undefined;
    if (!input.actorUserId) {
      guestOwnershipToken = createGuestOwnershipToken();
      guestOwnershipTokenHash = hashGuestOwnershipToken(guestOwnershipToken);
    }

    let draft: RestorationDraft;
    try {
      draft = await prisma.restorationDraft.create({
        data: {
          ownerUserId: input.actorUserId ?? null,
          guestOwnershipTokenHash: guestOwnershipTokenHash ?? null,
          market: derivedMarket.market,
          country: derivedMarket.country,
          currency: derivedMarket.currency,
          originalStorageKey: uploadResult.key,
          originalMimeType: validated.mimeType,
          originalWidth: validated.width,
          originalHeight: validated.height,
          originalFileSizeBytes: body.length,
          originalSha256: validated.sha256,
          status: "PREVIEW_READY"
        }
      });
    } catch (error) {
      try {
        await this.storage.deleteFile(uploadResult.key);
      } catch {
        // Do not disclose storage keys or the original DB failure to callers.
        throw new AppError("Upload could not be completed safely", 502, "STORAGE_CLEANUP_ERROR");
      }
      throw error;
    }

    return { draft: await this.toSafeView(draft), guestOwnershipToken };
  }

  async getDraft(id: string, actor: RequestActor): Promise<DraftSafeView> {
    const draft = await prisma.restorationDraft.findUnique({ where: { id } });
    const owned = assertOwnership(draft, actor);
    return this.toSafeView(owned);
  }

  async getOffers(id: string, actor: RequestActor) {
    const draft = await prisma.restorationDraft.findUnique({ where: { id } });
    const owned = assertOwnership(draft, actor);
    if (!owned.market || !owned.currency) {
      throw new AppError("Market has not been confirmed for this draft", 409, "MARKET_NOT_CONFIRMED");
    }
    const offers = this.offers.getDigitalOffers({ market: owned.market });
    return { market: owned.market, currency: owned.currency, offers };
  }

  private async toSafeView(draft: RestorationDraft): Promise<DraftSafeView> {
    // The signed preview URL always points at the ORIGINAL uploaded bytes --
    // there is no restored/enhanced/processed image at the draft stage, so
    // there is nothing else it could truthfully show.
    if (!draft.originalStorageKey || !draft.originalStorageKey.trim()) {
      throw new AppError("Preview is unavailable", 409, "PREVIEW_UNAVAILABLE");
    }
    const previewUrl = await this.storage.getSignedUrl(draft.originalStorageKey);
    const previewExpiresAt = new Date(Date.now() + PREVIEW_SIGNED_URL_TTL_MS).toISOString();
    return {
      id: draft.id,
      status: draft.status,
      market: draft.market,
      country: draft.country,
      currency: draft.currency,
      originalMimeType: draft.originalMimeType,
      originalWidth: draft.originalWidth,
      originalHeight: draft.originalHeight,
      originalFileSizeBytes: draft.originalFileSizeBytes,
      previewUrl,
      previewExpiresAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt
    };
  }
}
