import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";

type OrderImagePayload = {
  storageKey: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
};

export class OrderController {
  private readonly orderService = new OrderService();
  private readonly paymentService: PaymentService;

  constructor(config: AppConfig) {
    this.paymentService = new PaymentService(config);
  }

  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { whatsappNumber, packageSlug, serviceType } = req.body ?? {};
      if (!whatsappNumber || !packageSlug || !serviceType) {
        throw new AppError("whatsappNumber, packageSlug and serviceType are required", 400, "INVALID_REQUEST");
      }
      const result = await this.orderService.createOrder({ whatsappNumber, packageSlug, serviceType });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.getOrderByOrderNo(req.params.orderNo);
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  addOrderImages = async (req: Request, res: Response): Promise<void> => {
    try {
      const images = Array.isArray(req.body?.images) ? (req.body.images as OrderImagePayload[]) : [];
      const mapped = images.map((img: OrderImagePayload) => ({
        storageKey: String(img.storageKey || ""),
        mimeType: img.mimeType ? String(img.mimeType) : undefined,
        width: typeof img.width === "number" ? img.width : undefined,
        height: typeof img.height === "number" ? img.height : undefined,
        fileSizeBytes: typeof img.fileSizeBytes === "number" ? img.fileSizeBytes : undefined
      }));
      if (mapped.some((img) => !img.storageKey)) {
        throw new AppError("Each image requires storageKey", 400, "INVALID_IMAGE_INPUT");
      }
      const result = await this.orderService.addImages(req.params.orderNo, mapped);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  createOrderCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await this.orderService.getOrderByOrderNo(req.params.orderNo);
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

      res.json({
        success: true,
        data: {
          orderNo: order.orderNo,
          checkoutUrl: checkout.checkoutUrl,
          paymentReference: checkout.providerRef
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  listAdminOrders = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.listOrders();
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getAdminOrderById = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.getOrderById(req.params.id);
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
