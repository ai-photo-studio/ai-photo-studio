import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { AdminService } from "../services/admin.service";

export class AdminController {
  private readonly adminService: AdminService;

  constructor(config: AppConfig) {
    this.adminService = new AdminService(config);
  }

  dashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getDashboard();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  orders = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listOrders({
        status: req.query.status as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  orderDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getOrderDetail(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  failedJobs = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listFailedJobs();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  jobs = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listJobs({
        status: req.query.status as string | undefined,
        queueName: req.query.queueName as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  retryOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.retryOrder(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  approveManualPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.approveManualPayment(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  sendAgain = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.sendAgain(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  retryJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.retryJob(req.params.id);
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
