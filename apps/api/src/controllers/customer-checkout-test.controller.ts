import type { Request, Response } from "express";
import { CustomerCheckoutTestService } from "../services/customer-checkout-test.service";
import { actorFromRequest } from "../utils/ownership";
import { AppError, toErrorMessage } from "../utils/errors";

/** TEST/LOCAL-ONLY controller. See `customer-checkout-test.service.ts` header. */
export class CustomerCheckoutTestController {
  private readonly service = new CustomerCheckoutTestService();

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.createTestCheckout(req.params.orderNo, actorFromRequest(req));
      res.status(201).json({ success: true, data });
    } catch (error) {
      this.sendError(res, error);
    }
  };

  complete = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.completeTestPayment(req.params.orderNo, actorFromRequest(req));
      res.status(200).json({ success: true, data });
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
