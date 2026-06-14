import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { AdminService } from "../services/admin.service";
import { QueueHealthService } from "../services/queue-health.service";

export class AdminController {
  private readonly adminService: AdminService;
  private readonly queueHealth: QueueHealthService;

  constructor(config: AppConfig) {
    this.adminService = new AdminService(config);
    this.queueHealth = new QueueHealthService(config);
  }

  dashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getDashboard();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  stats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getStats();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  queueDepth = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.queueHealth.inspectImageQueue();
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

  payments = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listPayments({
        status: req.query.status as string | undefined,
        provider: req.query.provider as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  wallets = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listWallets({
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  subscriptions = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listSubscriptions(
        req.query.page ? Number(req.query.page) : undefined,
        req.query.limit ? Number(req.query.limit) : undefined
      );
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  customers = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listCustomers({
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search as string | undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  customerDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getCustomerDetail(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  packages = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listPackages({
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  upsertPackage = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.upsertPackage(req.body ?? {});
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

  approvePayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.approvePayment(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  rejectManualPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.rejectManualPayment(req.params.id, req.body?.reason as string | undefined);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  rejectPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.rejectPayment(req.params.id, req.body?.reason as string | undefined);
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

  toggleCustomerTestMode = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.toggleCustomerTestMode(req.params.id, req.body?.isTestAccount);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  creativeJobs = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.listCreativeStudioJobs({
        status: req.query.status as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  creativeJobDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getCreativeStudioJob(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  processingMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const hoursBack = req.query.hours ? Number(req.query.hours) : 24;
      const data = await this.adminService.getProcessingMetrics(hoursBack);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  queueMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getQueueMetrics();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  costMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const hoursBack = req.query.hours ? Number(req.query.hours) : 24;
      const data = await this.adminService.getCostMetrics(hoursBack);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

creativeCostMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const hoursBack = req.query.hours ? Number(req.query.hours) : 24;
      const data = await this.adminService.getCreativeCostMetrics(hoursBack);
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getQueueHealthStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.adminService.getQueueHealth();
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
