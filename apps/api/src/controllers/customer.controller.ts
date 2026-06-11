import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AuthService } from "../services/auth.service";
import { CustomerService } from "../services/customer.service";
import { AppError, toErrorMessage } from "../utils/errors";

export class CustomerController {
  private readonly customerService = new CustomerService();
  private readonly authService = new AuthService();

  constructor(_config: AppConfig) {}

  wallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.requireUser(req);
      const data = await this.customerService.getWalletOverview(user.id);
      res.json({ success: true, data: { user, ...data } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  payments = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.requireUser(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await this.customerService.getPaymentOverview(user.id, page || 1, limit || 10);
      res.json({ success: true, data: { user, ...data } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  subscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.requireUser(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await this.customerService.getSubscriptionOverview(user.id, page || 1, limit || 10);
      res.json({ success: true, data: { user, ...data } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private async requireUser(req: Request) {
    if (!req.user) {
      throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
    }
    return this.authService.getUserById(req.user.sub);
  }

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
