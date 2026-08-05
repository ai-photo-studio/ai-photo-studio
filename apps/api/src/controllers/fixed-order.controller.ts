import type { Request, Response } from "express";
import { AppError, toErrorMessage } from "../utils/errors";
import { actorFromRequest } from "../utils/ownership";
import { FixedOrderService } from "../services/fixed-order.service";

export class FixedOrderController {
  private readonly fixedOrders: FixedOrderService;

  constructor() {
    // Always the default (real, owner-approved ApprovedOfferProvider) --
    // no production code path may inject FixtureOfferProvider or any other
    // provider here.
    this.fixedOrders = new FixedOrderService();
  }

  /**
   * POST /api/fixed-orders/restoration-digital
   *
   * Body: { draftId, tier }. Only these two fields are ever read -- amount,
   * currency, PriceBook version, pricing source, and approval state cannot
   * be supplied by the client; they are always resolved server-side.
   */
  createRestorationDigitalOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
      const tier = typeof req.body?.tier === "string" ? req.body.tier : "";
      const data = await this.fixedOrders.createRestorationDigitalOrder(
        { draftId, tier },
        actorFromRequest(req)
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** GET /api/fixed-orders/:orderNo -- read-only. */
  getByOrderNo = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.fixedOrders.getByOrderNo(req.params.orderNo, actorFromRequest(req));
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
