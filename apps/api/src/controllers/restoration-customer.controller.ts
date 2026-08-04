import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { RestorationService } from "../services/restoration.service";

export class RestorationCustomerController {
  private readonly restoration: RestorationService;

  constructor(private readonly config: AppConfig) {
    this.restoration = new RestorationService(config);
  }

  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.restoration.getCustomerStatus(req.params.id, {
        userId: req.user?.sub ?? null,
        guestToken: req.headers["x-guest-ownership-token"] as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getDownload = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.restoration.getCustomerDownload(req.params.id, req.params.itemId, {
        userId: req.user?.sub ?? null,
        guestToken: req.headers["x-guest-ownership-token"] as string | undefined
      });
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
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
