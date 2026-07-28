import { Worker } from "bullmq";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { NotificationService } from "../services/notification.service";
import { OrderService } from "../services/order.service";
import { PhaseCImageProcessingQueue, type PhaseCImageProcessingPayload } from "../queues/phase-c-image-processing.queue";
import { ImageQueueService } from "../queues/image.queue";
import { StorageService } from "../services/storage.service";
import { DeliveryService } from "../services/delivery.service";
import { ImageProcessingService } from "../services/image-processing.service";
import { ProductClassifierService } from "../services/product-classifier.service";
import { resolveProductPipelineRoute } from "../services/product-routing.service";
import { WalletService } from "../services/wallet.service";
import { SubscriptionService } from "../services/subscription.service";
import { recordWorkerCompleted, recordWorkerFailure, recordWorkerStarted, setWorkerHealthState } from "../services/worker-health.service";
import { logger } from "../utils/logger";

type WorkerPayload = PhaseCImageProcessingPayload & { imageId?: string; orderId?: string };

const PRODUCT_RETENTION_DAYS = 30;

const toProcessedFileName = (fileName: string, jobId?: string) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `processed-${jobId || "job"}-${safe}`;
};

export const startImageProcessingWorker = (config: AppConfig) => {
  if (config.queueDryRun) {
    logger.warn("Phase E image worker skipped in dry-run queue mode");
    setWorkerHealthState({
      running: false,
      startedAt: null,
      lastCompletedAt: null,
      lastFailedAt: null,
      lastError: "queue dry-run mode",
      processedCount: 0
    });
    return null;
  }

  const storage = new StorageService(config);
  const orders = new OrderService();
  const notifications = new NotificationService();
  const delivery = new DeliveryService(config);
  const imageProcessing = new ImageProcessingService(config);
  const productClassifier = new ProductClassifierService(config);
  const deadLetterQueue = new PhaseCImageProcessingQueue(config);
  const imageQueue = new ImageQueueService(config);
  const walletService = new WalletService();
  const subscriptionService = new SubscriptionService();
  recordWorkerStarted();

  const worker = new Worker<WorkerPayload>(
    "image-processing",
    async (job) => {
      const payload = job.data as WorkerPayload;

      if (job.name === "delivery" && payload.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          include: { customer: true, images: true }
        });
        if (!order || order.orderStatus !== "COMPLETED") return;
        const outputs = order.images.filter((img) => img.kind === "FINAL" || img.kind === "PREVIEW");
        await delivery.sendOrderCompletedFromKeys(order.customer.whatsappNumber, order.orderNo, outputs.map((x) => x.storageKey));
        return;
      }

      if (job.name === "cleanup") {
        logger.info("Cleanup job received (handled by scheduled cleanup)");
        return;
      }

      if (payload.orderId && !payload.originalStorageKey) {
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          include: { images: true, customer: true }
        });
        if (!order || order.paymentStatus !== "PAID") return;
        for (const image of order.images.filter((x) => x.kind === "ORIGINAL")) {
          await imageQueue.enqueueImageProcessing(image.id);
        }
        return;
      }

      const processingJob = await prisma.processingJob.findUnique({
        where: { queueJobId: String(job.id) },
        include: { order: true, orderItem: true }
      });

      if (!processingJob) {
        logger.warn("Processing job record not found, creating on-the-fly", { jobId: job.id, orderId: payload.orderId });
        if (!payload.orderId) {
          throw new Error(`Cannot create processing job: missing orderId for queue job ${job.id}`);
        }

        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          include: { customer: true, package: true, user: true, images: true, statusHistory: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } }
        });

        if (!order) {
          throw new Error(`Order ${payload.orderId} not found`);
        }

        const newProcessingJob = await prisma.processingJob.create({
          data: {
            orderId: order.id,
            queueName: "image-processing",
            jobName: job.name,
            status: "QUEUED",
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts ?? 5,
            queueJobId: String(job.id),
            providerName: payload.providerName || config.aiProvider,
            workflowType: payload.workflowType || "PRODUCT",
            workflowMode: payload.workflowMode || "PRODUCT_STUDIO",
            payload: payload
          }
        });

        await orders.updateOrderStatus(order.id, {
          toStatus: "PROCESSING",
          source: "worker.image-processing",
          meta: {
            queueJobId: job.id,
            providerName: payload.providerName || config.aiProvider
          }
        });

        const orderForProcessing = order;
        const workflowType = (payload.workflowType || "PRODUCT") as "PRODUCT" | "VEHICLE";
        const workflowMode = (payload.workflowMode || "PRODUCT_STUDIO") as
          | "WHITE_BACKGROUND"
          | "SOLID_COLOR_BACKGROUND"
          | "SHADOW_ENHANCEMENT"
          | "PRODUCT_STUDIO"
          | "SHOWROOM"
          | "PREMIUM_ROAD"
          | "DARK_STUDIO"
          | "PLATE_BLUR";

        await prisma.processingJob.update({
          where: { id: newProcessingJob.id },
          data: {
            status: "RUNNING",
            attempts: job.attemptsMade + 1,
            startedAt: new Date(),
            errorMessage: null,
            deadLetterReason: null,
            failureStage: null
          }
        });

        const processingJobForWork = newProcessingJob;
        const orderForWork = orderForProcessing;
        const resolvedWorkflowType = workflowType;
        const resolvedWorkflowMode = workflowMode;
        const payloadWithDefaults = payload as PhaseCImageProcessingPayload & { originalStorageKey?: string };

        const workflowTypeForWork = resolvedWorkflowType;
        const workflowModeForWork = resolvedWorkflowMode;
        const billingReservation = (payloadWithDefaults as any).billingReservation ?? null;
        const reservationReferenceId = billingReservation?.referenceId || processingJobForWork.id;
        let walletReservation:
          | { walletId: string; transactionId: string; amount: number }
          | null = null;
        let activeSubscriptionId: string | null = null;

        try {
          if (billingReservation?.type === "WALLET") {
            walletReservation = {
              walletId: billingReservation.walletId,
              transactionId: billingReservation.transactionId,
              amount: billingReservation.amount
            };
          } else if (billingReservation?.type === "SUBSCRIPTION") {
            activeSubscriptionId = billingReservation.subscriptionId;
          } else if (orderForWork.userId) {
            const wallet = await walletService.getOrCreateWallet(orderForWork.userId);
            walletReservation = await walletService.reserveCredits({
              walletId: wallet.id,
              amount: 1,
              orderId: orderForWork.id,
              paymentId: orderForWork.payments[0]?.id,
              referenceType: "processing_job",
              referenceId: processingJobForWork.id,
              note: `Reserved for order ${orderForWork.orderNo}`,
              metadata: {
                queueJobId: job.id,
                packageCode: orderForWork.package.code
              }
            });

            const activeSubscription = await prisma.subscription.findFirst({
              where: {
                userId: orderForWork.userId,
                planCode: orderForWork.package.code,
                status: "ACTIVE"
              },
              orderBy: { createdAt: "desc" }
            });

            if (activeSubscription) {
              await subscriptionService.reserveUsage({
                subscriptionId: activeSubscription.id,
                amount: 1,
                referenceType: "processing_job",
                referenceId: processingJobForWork.id,
                note: `Reserved usage for order ${orderForWork.orderNo}`
              });
              activeSubscriptionId = activeSubscription.id;
            }
          } else {
            logger.info("Skipping wallet reservation because order has no web user", {
              orderId: orderForWork.id,
              orderNo: orderForWork.orderNo
            });
          }

          notifications.log("WHATSAPP_PROCESSING", {
            orderId: orderForWork.id,
            orderNo: orderForWork.orderNo,
            queueJobId: job.id,
            attempt: job.attemptsMade + 1,
            providerName: payload.providerName || config.aiProvider,
            workflowType: workflowTypeForWork,
            workflowMode: workflowModeForWork
          });

          const originalStorageKeyForWork = payloadWithDefaults.originalStorageKey;
          if (!originalStorageKeyForWork) {
            throw new Error("Original storage key is missing from processing payload");
          }

          const original = await storage.downloadFile(originalStorageKeyForWork);
          const originalImage = orderForWork.images.find((image) => image.storageKey === originalStorageKeyForWork) ?? orderForWork.images[0];
          const originalFileName = originalImage?.storageKey.split("/").pop() || `${orderForWork.orderNo}.jpg`;
          const processInput = {
            buffer: original.body,
            contentType: original.contentType || originalImage?.mimeType || "image/jpeg",
            fileName: originalFileName,
            orderId: orderForWork.id,
            orderNo: orderForWork.orderNo,
            mediaId: payloadWithDefaults.mediaId,
            selectedActions: payloadWithDefaults.selectedActions || []
          };

          const classification = await productClassifier.classify({
            body: original.body,
            contentType: processInput.contentType,
            fileName: processInput.fileName
          });
          const pipelineRoute = resolveProductPipelineRoute(classification);
          const routedWorkflowType = pipelineRoute.workflowType;
          const selectedActions = processInput.selectedActions || [];
          const actionAwareRoute =
            selectedActions.length > 0
              ? {
                  ...pipelineRoute,
                  workflowMode:
                    selectedActions.includes("white-background") ||
                    selectedActions.includes("remove-background") ||
                    selectedActions.includes("daraz-ready") ||
                    selectedActions.includes("shopify-ready")
                      ? ("WHITE_BACKGROUND" as const)
                      : selectedActions.includes("enhancement") || selectedActions.includes("meta-ads-ready")
                        ? ("SHADOW_ENHANCEMENT" as const)
                        : pipelineRoute.workflowMode,
                  pipelineUsed: `${pipelineRoute.pipelineUsed}+actions:${selectedActions.join(",")}`
                }
              : pipelineRoute;

          await prisma.processingJob.update({
            where: { id: processingJobForWork.id },
            data: {
              providerName: payload.providerName || processingJobForWork.providerName || config.aiProvider,
              workflowType: routedWorkflowType,
              workflowMode: actionAwareRoute.workflowMode
            }
          });

          const processed =
            routedWorkflowType === "VEHICLE"
              ? await imageProcessing.processVehicleImage(processInput, actionAwareRoute.workflowMode as "SHOWROOM" | "PREMIUM_ROAD" | "DARK_STUDIO" | "PLATE_BLUR", actionAwareRoute)
              : await imageProcessing.processProductImage(
                  processInput,
                  actionAwareRoute.workflowMode as "WHITE_BACKGROUND" | "SOLID_COLOR_BACKGROUND" | "SHADOW_ENHANCEMENT" | "PRODUCT_STUDIO",
                  actionAwareRoute
                );

          const processedUpload = await storage.uploadProcessed({
            fileName: toProcessedFileName(processed.fileName, String(job.id)),
            body: processed.buffer,
            contentType: processed.contentType
          });
          const processedDownloadUrl = await storage.generateDownloadUrl(processedUpload.key);
          const processedExpiresAt = new Date(Date.now() + PRODUCT_RETENTION_DAYS * 24 * 3600_000);

          await prisma.$transaction([
            prisma.orderImage.create({
              data: {
                orderId: orderForWork.id,
                kind: "FINAL",
                storageKey: processedUpload.key,
                mimeType: processed.contentType,
                fileSizeBytes: processed.buffer.length,
                expiresAt: processedExpiresAt
              }
            }),
            prisma.order.update({
              where: { id: orderForWork.id },
              data: {
                processedStorageKey: processedUpload.key,
                processedUrl: processedDownloadUrl,
                processedExpiresAt
              }
            }),
            prisma.processingJob.update({
              where: { id: processingJobForWork.id },
              data: {
                status: "COMPLETED",
                completedAt: new Date(),
                errorMessage: null,
                deadLetterReason: null,
                failureStage: null,
                providerName: processed.providerName,
                workflowType: processed.workflowType,
                workflowMode: processed.workflowMode
              }
            })
          ]);

          if (walletReservation) {
            await walletService.settleReservedCredits({
              walletId: walletReservation.walletId,
              amount: walletReservation.amount,
              orderId: orderForWork.id,
              paymentId: orderForWork.payments[0]?.id,
              referenceType: "processing_job",
              referenceId: reservationReferenceId,
              note: `Settled after completion for order ${orderForWork.orderNo}`
            });
          }

          if (activeSubscriptionId) {
            await subscriptionService.settleUsage({
              subscriptionId: activeSubscriptionId,
              amount: 1,
              referenceType: "processing_job",
              referenceId: reservationReferenceId,
              note: `Settled usage after completion for order ${orderForWork.orderNo}`
            });
          }

          await orders.updateOrderStatus(orderForWork.id, {
            toStatus: "COMPLETED",
            source: "worker.image-processing",
            meta: {
              queueJobId: job.id,
              providerName: processed.providerName,
              providerRequestId: processed.providerRequestId,
              category: classification.category,
              classificationConfidence: classification.confidence,
              processingProfile: pipelineRoute.processingProfile,
              pipelineUsed: actionAwareRoute.pipelineUsed,
              selectedActions,
              workflowType: processed.workflowType,
              workflowMode: processed.workflowMode,
              processedStorageKey: processedUpload.key,
              processedUrl: processedDownloadUrl,
              processedExpiresAt: processedExpiresAt.toISOString()
            }
          });

          if (processed.analysis) {
            const beforeQuality = processed.enhancement?.before;
            const afterQuality = processed.analysis.quality;
            const enhancementDelta = beforeQuality ? Math.round(afterQuality.overallScore - beforeQuality.overallScore) : null;
            await prisma.imageQualityScore.create({
              data: {
                orderId: orderForWork.id,
                processingJobId: processingJobForWork.id,
                providerName: processed.providerName,
                imageStorageKey: processedUpload.key,
                category: classification.category,
                classificationConfidence: classification.confidence,
                pipelineUsed: pipelineRoute.pipelineUsed,
                processingProfile: pipelineRoute.processingProfile,
                productDetected: processed.analysis.productDetected,
                confidence: processed.analysis.confidence,
                processingStage: processed.enhancement?.processingStage || "EXPORT",
                beforeBlurScore: beforeQuality?.blurScore ?? null,
                beforeBrightnessScore: beforeQuality?.brightnessScore ?? null,
                beforeContrastScore: beforeQuality?.contrastScore ?? null,
                beforeVisibilityScore: beforeQuality?.visibilityScore ?? null,
                beforeCropQualityScore: beforeQuality?.cropQualityScore ?? null,
                beforeOverallScore: beforeQuality?.overallScore ?? null,
                blurScore: afterQuality.blurScore,
                brightnessScore: afterQuality.brightnessScore,
                contrastScore: afterQuality.contrastScore,
                visibilityScore: afterQuality.visibilityScore,
                cropQualityScore: afterQuality.cropQualityScore,
                overallScore: afterQuality.overallScore,
                enhancementScore: processed.enhancement?.enhancementScore ?? null,
                enhancementDelta: enhancementDelta,
                boundingBoxLeft: processed.analysis.boundingBox.left,
                boundingBoxTop: processed.analysis.boundingBox.top,
                boundingBoxWidth: processed.analysis.boundingBox.width,
                boundingBoxHeight: processed.analysis.boundingBox.height,
                cropLeft: processed.analysis.cropCoordinates.left,
                cropTop: processed.analysis.cropCoordinates.top,
                cropRight: processed.analysis.cropCoordinates.right,
                cropBottom: processed.analysis.cropCoordinates.bottom,
                sourceWidth: processed.analysis.sourceDimensions.width,
                sourceHeight: processed.analysis.sourceDimensions.height,
                canvasWidth: processed.analysis.canvasDimensions.width,
                canvasHeight: processed.analysis.canvasDimensions.height,
                metadata: {
                  requestId: processed.analysis.requestId,
                  label: processed.analysis.label,
                  classificationCategory: classification.category,
                  classificationConfidence: classification.confidence,
                  processingProfile: pipelineRoute.processingProfile,
                  pipelineUsed: actionAwareRoute.pipelineUsed,
                  selectedActions
                }
              }
            });
          }

          notifications.log("WHATSAPP_COMPLETED", {
            orderId: orderForWork.id,
            orderNo: orderForWork.orderNo,
            providerName: processed.providerName,
            providerRequestId: processed.providerRequestId,
            processedStorageKey: processedUpload.key,
            processedUrl: processedDownloadUrl
          });

          await delivery.sendCompletedNotification({
            to: orderForWork.customer.whatsappNumber,
            orderNo: orderForWork.orderNo,
            resultUrl: processedDownloadUrl,
            providerName: processed.providerName
          });

          recordWorkerCompleted();

          return {
            orderId: orderForWork.id,
            processedStorageKey: processedUpload.key,
            processedUrl: processedDownloadUrl
          };
        } catch (error) {
          const processingJobId = processingJobForWork?.id ?? processingJob?.id;
          if (processingJobId) {
            await prisma.processingJob.update({
              where: { id: processingJobId },
              data: {
                attempts: job.attemptsMade + 1,
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : String(error)
              }
            });
          }

          if (walletReservation) {
            await walletService.releaseReservedCredits({
              walletId: walletReservation.walletId,
              amount: walletReservation.amount,
              orderId: orderForWork?.id ?? payload.orderId ?? "",
              paymentId: orderForWork?.payments[0]?.id,
              referenceType: "processing_job",
              referenceId: reservationReferenceId,
              note: `Released after failure for order ${orderForWork?.orderNo ?? payload.orderId ?? ""}`,
              metadata: {
                error: error instanceof Error ? error.message : String(error)
              }
            });
          }

          if (activeSubscriptionId) {
            await subscriptionService.releaseUsage({
              subscriptionId: activeSubscriptionId,
              amount: 1,
              referenceType: "processing_job",
              referenceId: reservationReferenceId,
              note: `Released usage after failure for order ${orderForWork?.orderNo ?? payload.orderId ?? ""}`
            });
          }

          throw error;
        }
      }

      const order = await prisma.order.findUnique({
        where: { id: processingJob.orderId },
        include: { customer: true, package: true, user: true, images: true, processingJobs: true, statusHistory: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } }
      });

      if (!order) {
        throw new Error(`Order ${processingJob.orderId} not found`);
      }

      const workflowType = (payload.workflowType || processingJob.workflowType || "PRODUCT") as "PRODUCT" | "VEHICLE";
      const workflowMode =
        (payload.workflowMode || processingJob.workflowMode || "PRODUCT_STUDIO") as
          | "WHITE_BACKGROUND"
          | "SOLID_COLOR_BACKGROUND"
          | "SHADOW_ENHANCEMENT"
          | "PRODUCT_STUDIO"
          | "SHOWROOM"
          | "PREMIUM_ROAD"
          | "DARK_STUDIO"
          | "PLATE_BLUR";

      await prisma.processingJob.update({
        where: { id: processingJob.id },
        data: {
          status: "RUNNING",
          attempts: job.attemptsMade + 1,
          startedAt: processingJob.startedAt ?? new Date(),
          errorMessage: null,
          deadLetterReason: null,
          failureStage: null,
          providerName: payload.providerName || processingJob.providerName || config.aiProvider,
          workflowType,
          workflowMode
        }
      });

      await orders.updateOrderStatus(order.id, {
        toStatus: "PROCESSING",
        source: "worker.image-processing",
        meta: {
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          providerName: payload.providerName || processingJob.providerName || config.aiProvider,
          workflowType,
          workflowMode,
          originalStorageKey: payload.originalStorageKey
        }
      });

      const billingReservation =
        (payload as PhaseCImageProcessingPayload & { billingReservation?: PhaseCImageProcessingPayload["billingReservation"] }).billingReservation ??
        ((processingJob.payload as Record<string, unknown> | null)?.billingReservation as PhaseCImageProcessingPayload["billingReservation"] | undefined) ??
        null;
      const reservationReferenceId = billingReservation?.referenceId || processingJob.id;
      let walletReservation:
        | {
            walletId: string;
            transactionId: string;
            amount: number;
          }
        | null = null;
      let activeSubscriptionId: string | null = null;

      try {
        if (billingReservation?.type === "WALLET") {
          walletReservation = {
            walletId: billingReservation.walletId,
            transactionId: billingReservation.transactionId,
            amount: billingReservation.amount
          };
        } else if (billingReservation?.type === "SUBSCRIPTION") {
          activeSubscriptionId = billingReservation.subscriptionId;
        } else if (order.userId) {
          const wallet = await walletService.getOrCreateWallet(order.userId);
          walletReservation = await walletService.reserveCredits({
            walletId: wallet.id,
            amount: 1,
            orderId: order.id,
            paymentId: order.payments[0]?.id,
            referenceType: "processing_job",
            referenceId: processingJob.id,
            note: `Reserved for order ${order.orderNo}`,
            metadata: {
              queueJobId: job.id,
              packageCode: order.package.code
            }
          });

          const activeSubscription = await prisma.subscription.findFirst({
            where: {
              userId: order.userId,
              planCode: order.package.code,
              status: "ACTIVE"
            },
            orderBy: { createdAt: "desc" }
          });

          if (activeSubscription) {
            await subscriptionService.reserveUsage({
              subscriptionId: activeSubscription.id,
              amount: 1,
              referenceType: "processing_job",
              referenceId: processingJob.id,
              note: `Reserved usage for order ${order.orderNo}`
            });
            activeSubscriptionId = activeSubscription.id;
          }
        } else {
          logger.info("Skipping wallet reservation because order has no web user", {
            orderId: order.id,
            orderNo: order.orderNo
          });
        }

        notifications.log("WHATSAPP_PROCESSING", {
          orderId: order.id,
          orderNo: order.orderNo,
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          providerName: payload.providerName || processingJob.providerName || config.aiProvider,
          workflowType,
          workflowMode
        });

        if (!payload.originalStorageKey) {
          throw new Error("Original storage key is missing from processing payload");
        }

        const original = await storage.downloadFile(payload.originalStorageKey);
        const originalImage = order.images.find((image) => image.storageKey === payload.originalStorageKey) ?? order.images[0];
        const originalFileName = originalImage?.storageKey.split("/").pop() || `${order.orderNo}.jpg`;
        const processInput = {
          buffer: original.body,
          contentType: original.contentType || originalImage?.mimeType || "image/jpeg",
          fileName: originalFileName,
          orderId: order.id,
          orderNo: order.orderNo,
          mediaId: payload.mediaId,
          selectedActions: payload.selectedActions || ((processingJob.payload as Record<string, unknown> | null)?.selectedActions as string[] | undefined)
        };

        const classification = await productClassifier.classify({
          body: original.body,
          contentType: processInput.contentType,
          fileName: processInput.fileName
        });
        const pipelineRoute = resolveProductPipelineRoute(classification);
        const routedWorkflowType = pipelineRoute.workflowType;
        const selectedActions = processInput.selectedActions || [];
        const actionAwareRoute =
          selectedActions.length > 0
            ? {
                ...pipelineRoute,
                workflowMode:
                  selectedActions.includes("white-background") ||
                  selectedActions.includes("remove-background") ||
                  selectedActions.includes("daraz-ready") ||
                  selectedActions.includes("shopify-ready")
                    ? ("WHITE_BACKGROUND" as const)
                    : selectedActions.includes("enhancement") || selectedActions.includes("meta-ads-ready")
                      ? ("SHADOW_ENHANCEMENT" as const)
                      : pipelineRoute.workflowMode,
                pipelineUsed: `${pipelineRoute.pipelineUsed}+actions:${selectedActions.join(",")}`
              }
            : pipelineRoute;

        await prisma.processingJob.update({
          where: { id: processingJob.id },
          data: {
            providerName: payload.providerName || processingJob.providerName || config.aiProvider,
            workflowType: routedWorkflowType,
            workflowMode: actionAwareRoute.workflowMode
          }
        });

        const processed =
          routedWorkflowType === "VEHICLE"
            ? await imageProcessing.processVehicleImage(processInput, actionAwareRoute.workflowMode as "SHOWROOM" | "PREMIUM_ROAD" | "DARK_STUDIO" | "PLATE_BLUR", actionAwareRoute)
            : await imageProcessing.processProductImage(
                processInput,
                actionAwareRoute.workflowMode as "WHITE_BACKGROUND" | "SOLID_COLOR_BACKGROUND" | "SHADOW_ENHANCEMENT" | "PRODUCT_STUDIO",
                actionAwareRoute
              );

        const processedUpload = await storage.uploadProcessed({
          fileName: toProcessedFileName(processed.fileName, String(job.id)),
          body: processed.buffer,
          contentType: processed.contentType
        });
        const processedDownloadUrl = await storage.generateDownloadUrl(processedUpload.key);
        const processedExpiresAt = new Date(Date.now() + PRODUCT_RETENTION_DAYS * 24 * 3600_000);

        await prisma.$transaction([
          prisma.orderImage.create({
            data: {
              orderId: order.id,
              kind: "FINAL",
              storageKey: processedUpload.key,
              mimeType: processed.contentType,
              fileSizeBytes: processed.buffer.length,
              expiresAt: processedExpiresAt
            }
          }),
          prisma.order.update({
            where: { id: order.id },
            data: {
              processedStorageKey: processedUpload.key,
              processedUrl: processedDownloadUrl,
              processedExpiresAt
            }
          }),
          prisma.processingJob.update({
            where: { id: processingJob.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              errorMessage: null,
              deadLetterReason: null,
              failureStage: null,
              providerName: processed.providerName,
              workflowType: processed.workflowType,
              workflowMode: processed.workflowMode
            }
          })
        ]);

        if (walletReservation) {
          await walletService.settleReservedCredits({
            walletId: walletReservation.walletId,
            amount: walletReservation.amount,
            orderId: order.id,
            paymentId: order.payments[0]?.id,
            referenceType: "processing_job",
            referenceId: reservationReferenceId,
            note: `Settled after completion for order ${order.orderNo}`
          });
        }

        if (activeSubscriptionId) {
          await subscriptionService.settleUsage({
            subscriptionId: activeSubscriptionId,
            amount: 1,
            referenceType: "processing_job",
            referenceId: reservationReferenceId,
            note: `Settled usage after completion for order ${order.orderNo}`
          });
        }

        await orders.updateOrderStatus(order.id, {
          toStatus: "COMPLETED",
          source: "worker.image-processing",
          meta: {
            queueJobId: job.id,
            providerName: processed.providerName,
            providerRequestId: processed.providerRequestId,
            category: classification.category,
            classificationConfidence: classification.confidence,
            processingProfile: pipelineRoute.processingProfile,
            pipelineUsed: actionAwareRoute.pipelineUsed,
            selectedActions,
            workflowType: processed.workflowType,
            workflowMode: processed.workflowMode,
            processedStorageKey: processedUpload.key,
            processedUrl: processedDownloadUrl,
            processedExpiresAt: processedExpiresAt.toISOString()
          }
        });

        if (processed.analysis) {
          const beforeQuality = processed.enhancement?.before;
          const afterQuality = processed.analysis.quality;
          const enhancementDelta = beforeQuality ? Math.round(afterQuality.overallScore - beforeQuality.overallScore) : null;
          await prisma.imageQualityScore.create({
            data: {
              orderId: order.id,
              processingJobId: processingJob.id,
              providerName: processed.providerName,
              imageStorageKey: processedUpload.key,
              category: classification.category,
              classificationConfidence: classification.confidence,
              pipelineUsed: pipelineRoute.pipelineUsed,
              processingProfile: pipelineRoute.processingProfile,
              productDetected: processed.analysis.productDetected,
              confidence: processed.analysis.confidence,
              processingStage: processed.enhancement?.processingStage || "EXPORT",
              beforeBlurScore: beforeQuality?.blurScore ?? null,
              beforeBrightnessScore: beforeQuality?.brightnessScore ?? null,
              beforeContrastScore: beforeQuality?.contrastScore ?? null,
              beforeVisibilityScore: beforeQuality?.visibilityScore ?? null,
              beforeCropQualityScore: beforeQuality?.cropQualityScore ?? null,
              beforeOverallScore: beforeQuality?.overallScore ?? null,
              blurScore: afterQuality.blurScore,
              brightnessScore: afterQuality.brightnessScore,
              contrastScore: afterQuality.contrastScore,
              visibilityScore: afterQuality.visibilityScore,
              cropQualityScore: afterQuality.cropQualityScore,
              overallScore: afterQuality.overallScore,
              enhancementScore: processed.enhancement?.enhancementScore ?? null,
              enhancementDelta: enhancementDelta,
              boundingBoxLeft: processed.analysis.boundingBox.left,
              boundingBoxTop: processed.analysis.boundingBox.top,
              boundingBoxWidth: processed.analysis.boundingBox.width,
              boundingBoxHeight: processed.analysis.boundingBox.height,
              cropLeft: processed.analysis.cropCoordinates.left,
              cropTop: processed.analysis.cropCoordinates.top,
              cropRight: processed.analysis.cropCoordinates.right,
              cropBottom: processed.analysis.cropCoordinates.bottom,
              sourceWidth: processed.analysis.sourceDimensions.width,
              sourceHeight: processed.analysis.sourceDimensions.height,
              canvasWidth: processed.analysis.canvasDimensions.width,
              canvasHeight: processed.analysis.canvasDimensions.height,
              metadata: {
                requestId: processed.analysis.requestId,
                label: processed.analysis.label,
                classificationCategory: classification.category,
                classificationConfidence: classification.confidence,
                processingProfile: pipelineRoute.processingProfile,
                pipelineUsed: actionAwareRoute.pipelineUsed,
                selectedActions
              }
            }
          });
        }

        notifications.log("WHATSAPP_COMPLETED", {
          orderId: order.id,
          orderNo: order.orderNo,
          providerName: processed.providerName,
          providerRequestId: processed.providerRequestId,
          processedStorageKey: processedUpload.key,
          processedUrl: processedDownloadUrl
        });

        await delivery.sendCompletedNotification({
          to: order.customer.whatsappNumber,
          orderNo: order.orderNo,
          resultUrl: processedDownloadUrl,
          providerName: processed.providerName
        });

        recordWorkerCompleted();

        return {
          orderId: order.id,
          processedStorageKey: processedUpload.key,
          processedUrl: processedDownloadUrl
        };
      } catch (error) {
        recordWorkerFailure(error instanceof Error ? error.message : String(error));
        if (walletReservation) {
          await walletService.releaseReservedCredits({
            walletId: walletReservation.walletId,
            amount: walletReservation.amount,
            orderId: order.id,
            paymentId: order.payments[0]?.id,
            referenceType: "processing_job",
            referenceId: reservationReferenceId,
            note: `Released after failure for order ${order.orderNo}`,
            metadata: {
              error: error instanceof Error ? error.message : String(error)
            }
          });
        }

        if (activeSubscriptionId) {
          await subscriptionService.releaseUsage({
            subscriptionId: activeSubscriptionId,
            amount: 1,
            referenceType: "processing_job",
            referenceId: reservationReferenceId,
            note: `Released usage after failure for order ${order.orderNo}`
          });
        }

        throw error;
      }
    },
    {
      connection: { url: config.REDIS_URL } as any
    }
  );

  worker.on("failed", async (job, error) => {
    if (!job) return;

    const payload = job.data;
    const processingJob = await prisma.processingJob.findUnique({
      where: { queueJobId: String(job.id) },
      include: { order: true }
    });

    if (!processingJob) {
      logger.error("Phase E worker failed without processing record", {
        jobId: job.id,
        error: error.message
      });
      return;
    }

    const maxAttempts = Number(job.opts.attempts ?? processingJob.maxAttempts ?? 5);
    const currentAttempt = job.attemptsMade + 1;
    const isFinalAttempt = currentAttempt >= maxAttempts;
    const providerName = payload.providerName || processingJob.providerName || config.aiProvider;
    const failureStage = job.stacktrace?.some((line) => line.toLowerCase().includes("provider")) ? "provider" : "queue";

    await prisma.processingJob.update({
      where: { id: processingJob.id },
      data: {
        attempts: currentAttempt,
        status: isFinalAttempt ? "FAILED" : "RETRYING",
        errorMessage: error.message,
        failedAt: isFinalAttempt ? new Date() : processingJob.failedAt,
        deadLetterReason: isFinalAttempt ? error.message : null,
        failureStage,
        providerName
      }
    });

    if (isFinalAttempt) {
      await deadLetterQueue.moveToDeadLetter(payload, error.message);
      await orders.updateOrderStatus(processingJob.orderId, {
        toStatus: "FAILED",
        source: "worker.image-processing",
        reason: error.message,
        meta: {
          queueJobId: job.id,
          attempts: currentAttempt,
          failureStage,
          providerName
        }
      });

      notifications.log("WHATSAPP_FAILED", {
        orderId: processingJob.orderId,
        orderNo: processingJob.order.orderNo,
        queueJobId: job.id,
        failureStage,
        providerName,
        error: error.message
      });
      return;
    }

    logger.warn("Phase E worker job will retry", {
      jobId: job.id,
      attempt: currentAttempt,
      maxAttempts,
      failureStage,
      providerName,
      error: error.message
    });
  });

  return worker;
};
