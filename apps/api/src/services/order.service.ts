import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { CustomerService } from "./customer.service";
import { PackageService } from "./package.service";

type CreateOrderInput = {
  whatsappNumber: string;
  packageSlug: string;
  serviceType: string;
};

type AddOrderImageInput = {
  storageKey: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
};

const toOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `APS-${ts}-${rand}`;
};

export class OrderService {
  private readonly customerService = new CustomerService();
  private readonly packageService = new PackageService();

  async createOrder(input: CreateOrderInput) {
    const pkg = await this.packageService.findActiveBySlug(input.packageSlug);
    if (!pkg) throw new AppError("Selected package is not available", 400, "PACKAGE_NOT_FOUND");

    const customer = await this.customerService.findOrCreateByWhatsAppNumber(input.whatsappNumber);
    const amount = Number(pkg.price);

    const order = await prisma.order.create({
      data: {
        orderNo: toOrderNo(),
        customerId: customer.id,
        packageId: pkg.id,
        subtotal: amount.toFixed(2),
        total: amount.toFixed(2),
        currency: pkg.currency,
        paymentStatus: "PENDING",
        orderStatus: "PAYMENT_PENDING",
        notes: `serviceType:${input.serviceType}`
      }
    });

    return {
      id: order.id,
      orderNo: order.orderNo,
      amount: Number(order.total),
      currency: order.currency,
      package: {
        code: pkg.code,
        name: pkg.name,
        price: Number(pkg.price)
      },
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus
    };
  }

  async getOrderByOrderNo(orderNo: string) {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        package: true,
        customer: true,
        images: true,
        payments: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  async addImages(orderNo: string, images: AddOrderImageInput[]) {
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (images.length === 0) throw new AppError("At least one image is required", 400, "IMAGES_REQUIRED");

    await prisma.orderImage.createMany({
      data: images.map((img) => ({
        orderId: order.id,
        storageKey: img.storageKey,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        fileSizeBytes: img.fileSizeBytes,
        kind: "ORIGINAL"
      }))
    });

    const imageCount = await prisma.orderImage.count({ where: { orderId: order.id, kind: "ORIGINAL" } });
    const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
    return {
      orderNo,
      imageCount,
      amount: refreshed ? Number(refreshed.total) : Number(order.total),
      paymentStatus: refreshed?.paymentStatus ?? order.paymentStatus,
      orderStatus: refreshed?.orderStatus ?? order.orderStatus
    };
  }

  async listOrders() {
    return prisma.order.findMany({
      include: { customer: true, package: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getOrderById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true, package: true, images: true, payments: true }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }
}
