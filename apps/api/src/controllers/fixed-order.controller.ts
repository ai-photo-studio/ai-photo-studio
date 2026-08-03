import type { Request, Response } from "express";
import { AppError, toErrorMessage } from "../utils/errors";
import { FixedOrderService } from "../services/fixed-order.service";
import { actorFromRequest } from "../utils/ownership";

export class FixedOrderController {
  private readonly orders: FixedOrderService;

  constructor() {
    this.orders = new FixedOrderService();
  }

  createRestorationDigitalOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { draftId, tier } = req.body ?? {};
      if (!draftId || !tier) {
        throw new AppError("draftId and tier are required", 400, "INVALID_REQUEST");
      }
      const order = await this.orders.createRestorationDigitalOrder({
        draftId,
        tier,
        actor: actorFromRequest(req)
      });
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderNo } = req.params;
      const order = await this.orders.getOrderByOrderNo(orderNo, actorFromRequest(req));
      res.json({ success: true, data: order });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * R9.2-P2R-CUSTOMER-ORDERS: GET /api/fixed-orders (list), distinct from
   * GET /api/fixed-orders/:orderNo (detail, unchanged). Only reachable behind
   * `requireAuth` (see routes/fixed-order.routes.ts) -- `req.user.sub` is the
   * sole source of the owning user id; any `ownerId`/`userId` in the query
   * string is ignored on purpose.
   */
  listMyOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerUserId = req.user?.sub;
      if (!ownerUserId) {
        throw new AppError("Authentication required", 401, "UNAUTHORIZED");
      }
      const queryValue = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
      const data = await this.orders.listMyOrders(ownerUserId, {
        page: queryValue(req.query.page) ? Number(queryValue(req.query.page)) : undefined,
        pageSize: queryValue(req.query.pageSize) ? Number(queryValue(req.query.pageSize)) : undefined,
        status: queryValue(req.query.status),
        market: queryValue(req.query.market),
        currency: queryValue(req.query.currency)
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
