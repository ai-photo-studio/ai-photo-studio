import type { Request, Response } from "express";
import { AppError, toErrorMessage } from "../utils/errors";
import { AdminCommerceService } from "../services/admin-commerce.service";

// R9.2-P2R-ADMIN: read-only admin controller for FixedOrder/PaymentAttempt.
// Every handler here is a GET with zero side effects -- no create/update/
// delete Prisma call is ever reachable from this controller.
export class AdminCommerceController {
  private readonly commerce: AdminCommerceService;

  constructor() {
    this.commerce = new AdminCommerceService();
  }

  listOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.commerce.listOrders({
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
        orderNo: req.query.orderNo as string | undefined,
        status: req.query.status as string | undefined,
        market: req.query.market as string | undefined,
        currency: req.query.currency as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrderDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.commerce.getOrderDetail(req.params.orderNo);
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
    // Never leak a stack trace to the client for an unexpected error.
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
