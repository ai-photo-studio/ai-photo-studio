import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { RestorationDraftService } from "../services/restoration-draft.service";
import { actorFromRequest } from "../utils/ownership";

export class RestorationDraftController {
  private readonly drafts: RestorationDraftService;

  constructor(config: AppConfig) {
    this.drafts = new RestorationDraftService(config);
  }

  createDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const { country, marketConfirmed, fileName, contentType, bodyBase64 } = req.body ?? {};
      const { draft, guestOwnershipToken } = await this.drafts.createDraft({
        country,
        marketConfirmed,
        fileName,
        contentType,
        bodyBase64,
        actorUserId: req.user?.sub
      });
      res.status(201).json({ success: true, data: { ...draft, guestOwnershipToken } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const draft = await this.drafts.getDraft(id, actorFromRequest(req));
      res.json({ success: true, data: draft });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOffers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const offers = await this.drafts.getOffers(id, actorFromRequest(req));
      res.json({ success: true, data: offers });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: "Unable to process this request" });
  }
}
