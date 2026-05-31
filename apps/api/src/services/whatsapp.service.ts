import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export class WhatsAppService {
  constructor(private readonly config: AppConfig) {}

  async sendTextMessage(to: string, body: string): Promise<{ dryRun: boolean; sent: boolean }> {
    if (this.config.whatsappDryRun) {
      logger.info("WhatsApp dry-run: skipped sendTextMessage", { to, preview: body.slice(0, 80) });
      return { dryRun: true, sent: false };
    }

    // Placeholder for real WhatsApp Cloud API send call in next steps.
    logger.info("WhatsApp sendTextMessage placeholder executed", { to });
    return { dryRun: false, sent: true };
  }

  async recordWebhookEventPlaceholder(payload: unknown): Promise<void> {
    // DB persistence will be connected once Prisma repositories are wired.
    const entryCount = Array.isArray((payload as any)?.entry) ? (payload as any).entry.length : 0;
    logger.info("Webhook event recorded (placeholder)", { entryCount });
  }
}
