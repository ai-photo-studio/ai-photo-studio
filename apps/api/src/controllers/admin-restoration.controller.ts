import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { AdminRestorationService } from "../services/admin-restoration.service";

export class AdminRestorationController {
  private readonly adminRestoration: AdminRestorationService;

  constructor(_config: AppConfig) {
    this.adminRestoration = new AdminRestorationService();
  }

  listOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminRestoration.listRestorations({
        status: req.query.status as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrderDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminRestoration.getRestorationDetail(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminRestoration.getStats();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  retryOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminRestoration.retryOrder(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  retryItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminRestoration.retryItem(req.params.id);
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
