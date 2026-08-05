import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { CustomerCheckoutService } from "../services/customer-checkout.service";
import { actorFromRequest } from "../utils/ownership";
import { AppError, toErrorMessage } from "../utils/errors";

export class CustomerCheckoutController {
  private readonly service: CustomerCheckoutService;

  constructor(config: AppConfig) {
    this.service = new CustomerCheckoutService(config);
  }

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const orderNo = typeof req.body?.orderNo === "string" ? req.body.orderNo : "";
      const data = await this.service.createCheckout({ orderNo }, actorFromRequest(req));
      res.status(201).json({ success: true, data });
    } catch (error) {
      this.sendError(res, error);
    }
  };

  status = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.getStatus(req.params.orderNo, actorFromRequest(req));
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
