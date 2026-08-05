// R9.2-P6C-CUSTOMER-MVP-FLOW
//
// Minimum customer MVP: market selection -> image upload -> RestorationDraft
// -> signed original preview -> server offers. Reuses, unchanged: the
// existing image-decode/byte validation (`imageValidation.ts`), market
// derivation (`market.ts`), ownership helpers (`ownership.ts`/
// `guest-ownership.ts`), and the approved-offer pricing stack
// (`offerProvider.ts`/`approvedOfferProvider.ts`/`priceBook.ts`). This file
// only wires them together for the first time -- nothing here duplicates an
// existing service.
//
// Storage is injected as a narrow port (same pattern as
// `sharp-variant.service.ts`'s `SharpVariantStorage`) so this service never
// depends on `AppConfig`/env directly -- production wires the real
// `StorageService`; tests inject a trivial in-memory fake. Zero live
// Replicate/R2/RunPod/MPGS call is possible from this file: it never
// imports any provider/gateway module.
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import { createGuestOwnershipToken, hashGuestOwnershipToken } from "../utils/guest-ownership";
import {
  assertSafeUploadFileName,
  decodeDraftImageBase64,
  validateRestorationDraftImage
} from "../domain/restorationDraft/imageValidation";
import { assertMarketConfirmed, deriveMarketFromCountry } from "../domain/restorationDraft/market";
import { ApprovedOfferProvider } from "../domain/pricing/approvedOfferProvider";
import type { DigitalOffer, OffersUnavailable } from "../domain/pricing/offerProvider";
import type { Market, FixedOrderCurrency } from "../domain/fixedOrder/fixedOrderGuards";

export interface RestorationDraftStoragePort {
  uploadOriginal(params: { fileName: string; contentType: string; body: Buffer }): Promise<{ key: string }>;
  getSignedUrl(key: string): Promise<string>;
}

export interface CreateRestorationDraftInput {
  fileName: unknown;
  contentType: unknown;
  bodyBase64: unknown;
  country: unknown;
  confirmed: unknown;
}

export interface RestorationDraftSafeView {
  id: string;
  status: string;
  market: Market | null;
  currency: FixedOrderCurrency | null;
  country: string | null;
  originalMimeType: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  createdAt: string;
}

export interface RestorationDraftSafeViewWithPreview extends RestorationDraftSafeView {
  /** Signed, time-limited URL. The private storage key itself is never returned. */
  previewUrl: string;
}

function toSafeView(draft: {
  id: string;
  status: string;
  market: string | null;
  currency: string | null;
  country: string | null;
  originalMimeType: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  createdAt: Date;
}): RestorationDraftSafeView {
  return {
    id: draft.id,
    status: draft.status,
    market: draft.market as Market | null,
    currency: draft.currency as FixedOrderCurrency | null,
    country: draft.country,
    originalMimeType: draft.originalMimeType,
    originalWidth: draft.originalWidth,
    originalHeight: draft.originalHeight,
    createdAt: draft.createdAt.toISOString()
  };
}

export class RestorationDraftService {
  constructor(private readonly storage: RestorationDraftStoragePort) {}

  /**
   * Real byte/decode validation happens BEFORE any storage write or database
   * mutation (`validateRestorationDraftImage` decodes the actual bytes; a
   * renamed non-image or corrupt/oversized file is rejected here). Upload to
   * storage happens only after validation passes; the draft row is created
   * only after the upload succeeds.
   */
  async createDraft(
    input: CreateRestorationDraftInput,
    actor: RequestActor
  ): Promise<RestorationDraftSafeView & { guestOwnershipToken?: string }> {
    assertMarketConfirmed(input.confirmed);
    const derived = deriveMarketFromCountry(String(input.country ?? ""));
    const fileName = assertSafeUploadFileName(input.fileName);
    const body = decodeDraftImageBase64(input.bodyBase64);
    const validated = await validateRestorationDraftImage(body);

    const upload = await this.storage.uploadOriginal({
      fileName,
      contentType: validated.mimeType,
      body
    });

    const guestOwnershipToken = actor.userId ? undefined : createGuestOwnershipToken();

    const draft = await prisma.restorationDraft.create({
      data: {
        originalStorageKey: upload.key,
        originalMimeType: validated.mimeType,
        originalWidth: validated.width,
        originalHeight: validated.height,
        originalFileSizeBytes: body.length,
        originalSha256: validated.sha256,
        market: derived.market,
        currency: derived.currency,
        country: derived.country,
        ownerUserId: actor.userId ?? null,
        guestOwnershipTokenHash: guestOwnershipToken ? hashGuestOwnershipToken(guestOwnershipToken) : null,
        status: "UPLOADED"
      }
    });

    return { ...toSafeView(draft), guestOwnershipToken };
  }

  /** Returns a signed, time-limited preview URL. The storage key itself is never included in the response. */
  async getDraft(id: string, actor: RequestActor): Promise<RestorationDraftSafeViewWithPreview> {
    const draft = await prisma.restorationDraft.findUnique({ where: { id } });
    const owned = assertOwnership(draft, actor);
    const previewUrl = await this.storage.getSignedUrl(owned.originalStorageKey);
    return { ...toSafeView(owned), previewUrl };
  }

  async getOffers(id: string, actor: RequestActor): Promise<DigitalOffer[] | OffersUnavailable> {
    const draft = await prisma.restorationDraft.findUnique({ where: { id } });
    const owned = assertOwnership(draft, actor);
    if (!owned.market) {
      throw new AppError("draft has no resolved market", 422, "INVALID_MARKET");
    }
    return new ApprovedOfferProvider().getDigitalOffers({ market: owned.market as Market });
  }
}
