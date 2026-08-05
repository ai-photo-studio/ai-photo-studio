import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { actorFromRequest } from "../utils/ownership";
import { StorageService } from "../services/storage.service";
import { RestorationDraftService } from "../services/restoration-draft.service";

export class RestorationDraftController {
  private readonly drafts: RestorationDraftService;

  constructor(config: AppConfig) {
    const storage = new StorageService(config);
    this.drafts = new RestorationDraftService({
      uploadOriginal: (params) => storage.uploadOriginal(params),
      getSignedUrl: (key) => storage.getSignedUrl(key)
    });
  }

  /** POST /api/restoration-drafts. Body: { fileName, contentType, bodyBase64, country, confirmed }. */
  createDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body ?? {};
      const data = await this.drafts.createDraft(
        {
          fileName: body.fileName,
          contentType: body.contentType,
          bodyBase64: body.bodyBase64,
          country: body.country,
          confirmed: body.confirmed
        },
        actorFromRequest(req)
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** GET /api/restoration-drafts/:id */
  getDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.drafts.getDraft(req.params.id, actorFromRequest(req));
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** GET /api/restoration-drafts/:id/offers */
  getOffers = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.drafts.getOffers(req.params.id, actorFromRequest(req));
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    // MarketConfirmationError and other domain errors are treated as 422.
    if (error instanceof Error && error.name === "MarketConfirmationError") {
      res.status(422).json({ success: false, code: "MARKET_NOT_CONFIRMED", message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
