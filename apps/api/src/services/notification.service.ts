import { logger } from "../utils/logger";

export type NotificationEvent =
  | "WHATSAPP_ORDER_RECEIVED"
  | "WHATSAPP_PROCESSING"
  | "WHATSAPP_COMPLETED"
  | "WHATSAPP_FAILED"
  | "EMAIL_ORDER_RECEIVED"
  | "EMAIL_PROCESSING_COMPLETED"
  | "EMAIL_PROCESSING_FAILED"
  | "EMAIL_DOWNLOAD_READY";

export type EmailResult = { sent: boolean; dryRun: boolean };

export class NotificationService {
  readonly emailEnabled: boolean;

  constructor(config?: { emailEnabled?: boolean }) {
    this.emailEnabled = config?.emailEnabled ?? false;
  }

  log(event: NotificationEvent, details: Record<string, unknown>): void {
    logger.info("Notification event", { event, ...details });
  }

  sendEmail(to: string, subject: string, body: string): EmailResult {
    logger.info("Email notification", { to, subject, body: body.slice(0, 120) });

    if (!this.emailEnabled) {
      logger.info("Email dry-run: skipped sendEmail", { to, subject, preview: body.slice(0, 80) });
      return { sent: false, dryRun: true };
    }

    logger.info("Email sendEmail placeholder executed", { to, subject });
    return { sent: true, dryRun: false };
  }
}
