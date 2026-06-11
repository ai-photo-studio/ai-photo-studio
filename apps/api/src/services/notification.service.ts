import { logger } from "../utils/logger";

export type NotificationEvent =
  | "WHATSAPP_ORDER_RECEIVED"
  | "WHATSAPP_PROCESSING"
  | "WHATSAPP_COMPLETED"
  | "WHATSAPP_FAILED";

export class NotificationService {
  log(event: NotificationEvent, details: Record<string, unknown>): void {
    logger.info("Notification event", { event, ...details });
  }
}
