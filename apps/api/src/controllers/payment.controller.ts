import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";
import { AppError, toErrorMessage } from "../utils/errors";

export class PaymentController {
  private readonly paymentService: PaymentService;
  private readonly orderService = new OrderService();

  constructor(config: AppConfig) {
    this.paymentService = new PaymentService(config);
  }

  createCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
      const orderNo = String(req.body?.orderNo || "");
      if (!orderNo) throw new AppError("orderNo is required", 400, "INVALID_REQUEST");
      const order = await this.orderService.getOrderByOrderNo(orderNo);
      const amount = Number(order.total);
      if (amount <= 0) throw new AppError("Order amount must be greater than zero", 400, "INVALID_AMOUNT");

      const checkout = await this.paymentService.createCheckout({
        orderId: order.id,
        orderNo: order.orderNo,
        amount,
        currency: order.currency
      });

      await this.paymentService.createPaymentRecord({
        orderId: order.id,
        amount,
        currency: order.currency,
        providerName: checkout.providerName,
        gatewayRef: checkout.providerRef,
        checkoutUrl: checkout.checkoutUrl
      });

      res.json({ success: true, data: checkout });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  webhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.paymentService.handleWebhook(req.body, req.headers);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  submitManualProof = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderNo, screenshotPath, screenshotStorageKey, note } = req.body ?? {};
      if (!orderNo || !screenshotPath) {
        throw new AppError("orderNo and screenshotPath are required", 400, "INVALID_REQUEST");
      }

      const payment = await this.paymentService.recordManualPaymentProof({
        orderNo: String(orderNo),
        screenshotPath: String(screenshotPath),
        screenshotStorageKey: screenshotStorageKey ? String(screenshotStorageKey) : undefined,
        note: note ? String(note) : undefined
      });

      res.status(201).json({ success: true, data: payment });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.paymentService.getOrderPaymentStatus(req.params.orderNo);
      res.json({ success: true, data: result });
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
