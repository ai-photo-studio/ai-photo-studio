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
   * Body selects draft/tier/product/print fulfilment details. Amount,
   * currency, PriceBook version, pricing source, approval state, print quote,
   * delivery charge, and total are never accepted from the client.
   */
  createRestorationDigitalOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
      const tier = typeof req.body?.tier === "string" ? req.body.tier : "";
      const product = req.body?.product === "PRINT_DIGITAL" ? "PRINT_DIGITAL" : "DIGITAL";
      const data = await this.fixedOrders.createRestorationDigitalOrder(
        { draftId, tier, product, printSize: req.body?.printSize, quantity: req.body?.quantity, deliveryAddress: req.body?.deliveryAddress },
        actorFromRequest(req)
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getPrintCatalog = (_req: Request, res: Response): void => { res.json({ success: true, data: this.fixedOrders.getPrintCatalog() }); };

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
