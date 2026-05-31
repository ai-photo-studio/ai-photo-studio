import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { shouldSendWelcomeMenu, getServiceMenuText } from "../services/conversation.service";
import { WhatsAppService } from "../services/whatsapp.service";
import { logger } from "../utils/logger";
import { parseWhatsAppWebhook } from "../utils/whatsappParser";

export class WhatsAppController {
  private readonly service: WhatsAppService;

  constructor(private readonly config: AppConfig) {
    this.service = new WhatsAppService(config);
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
      }
    }
  };
}
