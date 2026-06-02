import assert from "node:assert/strict";

import { WhatsAppController } from "../apps/api/src/controllers/whatsapp.controller";
import { WhatsAppImageFlowService } from "../apps/api/src/services/whatsapp-image.service";
import { WhatsAppService } from "../apps/api/src/services/whatsapp.service";
import { OrderService } from "../apps/api/src/services/order.service";
import { StorageService } from "../apps/api/src/services/storage.service";
import { BackgroundRemoverService } from "../apps/api/src/services/background-remover.service";
import { ImageQueueService } from "../apps/api/src/queues/image.queue";
import { prisma } from "../apps/api/src/db/prisma";

const config = {
  NODE_ENV: "test",
  PORT: 4000,
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_PROVIDER: "r2",
  BACKGROUND_API_URL: "http://127.0.0.1:8001",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "phone-number-id",
  PAYMENT_GATEWAY_NAME: "manual",
  PAYMENT_GATEWAY_BASE_URL: "",
  PAYMENT_GATEWAY_SECRET: "",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_BASE_URL: "https://r2.test",
  AI_PROVIDER_NAME: "mock",
  AI_PROVIDER_API_KEY: "",
  ADMIN_JWT_SECRET: "admin-secret",
  whatsappDryRun: false,
  storageDryRun: false,
  queueDryRun: true
} as const;

const calls = {
  text: [] as Array<{ to: string; body: string }>,
  image: [] as Array<{ to: string; url: string; caption?: string }>,
  queue: [] as string[],
  downloads: [] as string[],
  uploads: [] as Array<{ keyPrefix: string; fileName: string; contentType?: string }>,
  processed: [] as string[]
};

const state = {
  order: {
    id: "order-1",
    orderNo: "APS-TEST-001",
    paymentStatus: "PAID",
    orderStatus: "PAID",
    customer: { whatsappNumber: "+923001112233" },
    images: [] as Array<{ id: string; kind: "ORIGINAL" | "PREVIEW" | "FINAL"; storageKey: string }>,
    aiJobs: [] as Array<{ id: string; status: string; outputKey?: string; errorMessage?: string }>
  },
  images: [] as Array<{
    id: string;
    orderId: string;
    storageKey: string;
    mimeType?: string;
    kind: "ORIGINAL" | "PREVIEW" | "FINAL";
  }>,
  jobs: [] as Array<{ id: string; status: string; outputKey?: string; errorMessage?: string }>
};

const originalSendText = WhatsAppService.prototype.sendTextMessage;
const originalSendImage = WhatsAppService.prototype.sendImageMessage;
const originalDownloadMedia = WhatsAppService.prototype.downloadMedia;
const originalFindLatestPaidOrder = OrderService.prototype.findLatestPaidOrderByWhatsAppNumber;
const originalAddImage = OrderService.prototype.addImage;
const originalUploadFile = StorageService.prototype.uploadFile;
const originalDownloadFile = StorageService.prototype.downloadFile;
const originalEnqueue = ImageQueueService.prototype.enqueueWhatsAppImageProcessing;
const originalProductWhite = BackgroundRemoverService.prototype.productWhite;
const originalPrismaOrderImageFindUnique = prisma.orderImage.findUnique;
const originalPrismaOrderImageCreate = prisma.orderImage.create;
const originalPrismaAiJobCreate = prisma.aiJob.create;
const originalPrismaAiJobUpdate = prisma.aiJob.update;
const originalPrismaOrderUpdate = prisma.order.update;
const originalPrismaOrderFindUnique = prisma.order.findUnique;
const originalPrismaTransaction = prisma.$transaction;

WhatsAppService.prototype.sendTextMessage = (async function (this: WhatsAppService, to: string, body: string) {
  calls.text.push({ to, body });
  return { dryRun: false, sent: true };
}) as typeof WhatsAppService.prototype.sendTextMessage;

WhatsAppService.prototype.sendImageMessage = (async function (
  this: WhatsAppService,
  to: string,
  imageUrl: string,
  caption?: string
) {
  calls.image.push({ to, url: imageUrl, caption });
  return { dryRun: false, sent: true };
}) as typeof WhatsAppService.prototype.sendImageMessage;

WhatsAppService.prototype.downloadMedia = (async function (this: WhatsAppService, mediaId: string) {
  calls.downloads.push(mediaId);
  return {
    buffer: Buffer.from("original-image-bytes"),
    mimeType: "image/png",
    fileName: `${mediaId}.png`
  };
}) as typeof WhatsAppService.prototype.downloadMedia;

OrderService.prototype.findLatestPaidOrderByWhatsAppNumber = (async function () {
  return state.order as any;
}) as typeof OrderService.prototype.findLatestPaidOrderByWhatsAppNumber;

OrderService.prototype.addImage = (async function (_orderId: string, image: any) {
  const created = {
    id: `order-image-${state.images.length + 1}`,
    orderId: "order-1",
    storageKey: image.storageKey,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    fileSizeBytes: image.fileSizeBytes,
    kind: image.kind || "ORIGINAL"
  };
  state.images.push(created);
  return created as any;
}) as typeof OrderService.prototype.addImage;

StorageService.prototype.uploadFile = (async function (this: StorageService, params: any) {
  const suffix = calls.uploads.length + 1;
  const key = `${params.keyPrefix}/uploaded-${suffix}.jpg`;
  calls.uploads.push({ keyPrefix: params.keyPrefix, fileName: params.fileName, contentType: params.contentType });
  return {
    key,
    url: `https://r2.test/${key}`,
    expiresAt: new Date()
  };
}) as typeof StorageService.prototype.uploadFile;

StorageService.prototype.downloadFile = (async function (_key: string) {
  return { body: Buffer.from("processed-input"), contentType: "image/png" };
}) as typeof StorageService.prototype.downloadFile;

ImageQueueService.prototype.enqueueWhatsAppImageProcessing = (async function (this: ImageQueueService, imageId: string) {
  calls.queue.push(imageId);
  return { dryRun: false };
}) as typeof ImageQueueService.prototype.enqueueWhatsAppImageProcessing;

BackgroundRemoverService.prototype.productWhite = (async function (_input: any) {
  calls.processed.push("product-white");
  return {
    body: Buffer.from("processed-image-bytes"),
    contentType: "image/jpeg",
    fileName: "product-white.jpg"
  };
}) as typeof BackgroundRemoverService.prototype.productWhite;

prisma.orderImage.findUnique = (async function ({ where }: any) {
  if (where?.id !== "order-image-1") return null as any;
  return {
    id: "order-image-1",
    orderId: "order-1",
    storageKey: "originals/key1.png",
    mimeType: "image/png",
    kind: "ORIGINAL",
    order: {
      ...state.order,
      images: state.images,
      aiJobs: state.jobs
    }
  } as any;
}) as typeof prisma.orderImage.findUnique;

prisma.orderImage.create = (async function ({ data }: any) {
  const created = {
    id: `final-image-${state.images.length + 1}`,
    orderId: data.orderId,
    storageKey: data.storageKey,
    mimeType: data.mimeType,
    width: data.width,
    height: data.height,
    fileSizeBytes: data.fileSizeBytes,
    kind: data.kind || "ORIGINAL"
  };
  state.images.push(created);
  return created as any;
}) as typeof prisma.orderImage.create;

prisma.aiJob.create = (async function ({ data }: any) {
  const created = {
    id: `job-${state.jobs.length + 1}`,
    ...data,
    status: "RUNNING"
  };
  state.jobs.push(created);
  return created as any;
}) as typeof prisma.aiJob.create;

prisma.aiJob.update = (async function ({ where, data }: any) {
  const job = state.jobs.find((item) => item.id === where.id);
  if (job) Object.assign(job, data);
  return (job ?? { id: where.id, ...data }) as any;
}) as typeof prisma.aiJob.update;

prisma.order.update = (async function ({ where, data }: any) {
  if (where?.id === state.order.id) Object.assign(state.order, data);
  return state.order as any;
}) as typeof prisma.order.update;

prisma.order.findUnique = (async function ({ where }: any) {
  if (where?.id !== state.order.id) return null as any;
  return {
    ...state.order,
    images: state.images,
    aiJobs: state.jobs,
    customer: state.order.customer
  } as any;
}) as typeof prisma.order.findUnique;

prisma.$transaction = (async function (ops: any[]) {
  return Promise.all(ops);
}) as typeof prisma.$transaction;

async function main() {
  const controller = new WhatsAppController(config as any);
  const flow = new WhatsAppImageFlowService(config as any);

  const req: any = {
    body: {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "+92 300 1112233",
                    type: "image",
                    image: { id: "media-123" }
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    query: {}
  };

  const res: any = {
    statusCode: 0,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    }
  };

  await controller.receiveWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { success: true });
  assert.equal(calls.text[0]?.body, "Image received. Preparing your product photo.");
  assert.equal(calls.queue[0], "order-image-1");
  assert.equal(calls.downloads[0], "media-123");

  await flow.processQueuedImage("order-image-1");

  assert.equal(calls.image[0]?.to, "+923001112233");
  assert.equal(calls.image[0]?.url, "https://r2.test/finals/uploaded-2.jpg");
  assert.equal(state.order.orderStatus, "COMPLETED");
  assert.equal(calls.processed.includes("product-white"), true);

  console.log("WhatsApp image flow local tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  WhatsAppService.prototype.sendTextMessage = originalSendText;
  WhatsAppService.prototype.sendImageMessage = originalSendImage;
  WhatsAppService.prototype.downloadMedia = originalDownloadMedia;
  OrderService.prototype.findLatestPaidOrderByWhatsAppNumber = originalFindLatestPaidOrder;
  OrderService.prototype.addImage = originalAddImage;
  StorageService.prototype.uploadFile = originalUploadFile;
  StorageService.prototype.downloadFile = originalDownloadFile;
  ImageQueueService.prototype.enqueueWhatsAppImageProcessing = originalEnqueue;
  BackgroundRemoverService.prototype.productWhite = originalProductWhite;
  prisma.orderImage.findUnique = originalPrismaOrderImageFindUnique;
  prisma.orderImage.create = originalPrismaOrderImageCreate;
  prisma.aiJob.create = originalPrismaAiJobCreate;
  prisma.aiJob.update = originalPrismaAiJobUpdate;
  prisma.order.update = originalPrismaOrderUpdate;
  prisma.order.findUnique = originalPrismaOrderFindUnique;
  prisma.$transaction = originalPrismaTransaction;
});
