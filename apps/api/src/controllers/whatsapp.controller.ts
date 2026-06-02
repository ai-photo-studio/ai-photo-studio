import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { extractSelectedPackage, getServiceMenuText, shouldSendWelcomeMenu } from "../services/conversation.service";
import { OrderService } from "../services/order.service";
import { WhatsAppImageFlowService } from "../services/whatsapp-image.service";
import { WhatsAppService } from "../services/whatsapp.service";
import { logger } from "../utils/logger";
import { parseWhatsAppWebhook } from "../utils/whatsappParser";

export class WhatsAppController {
  private readonly service: WhatsAppService;
  private readonly orderService = new OrderService();
  private readonly imageFlow: WhatsAppImageFlowService;

  constructor(private readonly config: AppConfig) {
    this.service = new WhatsAppService(config);
    this.imageFlow = new WhatsAppImageFlowService(config);
  }

  verifyWebhook = (req: Request, res: Response): void => {
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");

    if (mode === "subscribe" && token === this.config.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }

    logger.warn("WhatsApp webhook verify failed", { mode });
    res.status(403).json({ success: false, message: "Verification failed" });
  };

  receiveWebhook = async (req: Request, res: Response): Promise<void> => {
    const payload = req.body;
    const parsed = parseWhatsAppWebhook(payload);

    logger.info("WhatsApp webhook received", {
      messageCount: parsed.length,
      types: parsed.map((m) => m.type)
    });

    // Reply quickly to webhook sender, continue async handling.
    res.status(200).json({ success: true });

    await this.service.recordWebhookEventPlaceholder(payload);

    for (const msg of parsed) {
      if (msg.type === "text" && shouldSendWelcomeMenu(msg.text)) {
        await this.service.sendTextMessage(msg.from, getServiceMenuText());
        continue;
      }

      if (msg.type === "text") {
        const selectedPackage = extractSelectedPackage(msg.text);
        if (selectedPackage) {
          try {
            const order = await this.orderService.createOrder({
              whatsappNumber: msg.from,
              packageSlug: selectedPackage,
              serviceType: "Product Photo Editing"
            });
            await this.service.sendTextMessage(
              msg.from,
              `Order created: ${order.orderNo}\nPackage: ${order.package.name}\nAmount: ${order.amount} ${order.currency}\nPlease upload your images.`
            );
          } catch (error) {
            logger.warn("Package selected but order creation failed", { from: msg.from, selectedPackage });
          }
        }
      }

      if (msg.type === "image" && msg.imageId) {
        try {
          const result = await this.imageFlow.handleIncomingImage(msg.from, msg.imageId);
          logger.info("WhatsApp image workflow handled", {
            from: msg.from,
            accepted: result.accepted,
            orderNo: "orderNo" in result ? result.orderNo : undefined
          });
        } catch (error) {
          logger.warn("WhatsApp image workflow failed", {
            from: msg.from,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  };
}
