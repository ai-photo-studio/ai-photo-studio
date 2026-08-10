import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { FixedOrderRestorationStatusService } from "../services/fixed-order-restoration-status.service";
import { actorFromRequest } from "../utils/ownership";
import { AppError, toErrorMessage } from "../utils/errors";

export class FixedOrderRestorationStatusController {
  private readonly service: FixedOrderRestorationStatusService;

  constructor(config: AppConfig) {
    this.service = new FixedOrderRestorationStatusService(config);
  }

  /** GET /api/fixed-orders/:orderNo/restoration-status -- read-only. */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getRestorationStatus(req.params.orderNo, actorFromRequest(req));
      res.json({ success: true, data });
    } catch (error) {
      this.sendError(res, error);
    }
  };

  private sendError(res: Response, error: unknown): void {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
