import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";
import { WhatsAppService } from "./whatsapp.service";
import { StorageService } from "./storage.service";

export type CompletedDeliveryPayload = {
  to: string;
  orderNo: string;
  resultUrl: string;
  providerName?: string;
  text: string;
  mode: "LOG_ONLY" | "WHATSAPP";
};

export class DeliveryService {
  private readonly whatsapp: WhatsAppService;
  private readonly storage: StorageService;
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.whatsapp = new WhatsAppService(config);
    this.storage = new StorageService(config);
  }

  buildCompletedNotificationPayload(input: {
    to: string;
    orderNo: string;
    resultUrl: string;
    providerName?: string;
  }): CompletedDeliveryPayload {
    return {
      ...input,
      text: `Order ${input.orderNo} completed. Download: ${input.resultUrl}`,
      mode: this.config.deliveryMode
    };
  }

  async sendCompletedNotification(input: {
    to: string;
    orderNo: string;
    resultUrl: string;
    providerName?: string;
  }) {
    const payload = this.buildCompletedNotificationPayload(input);

    if (this.config.deliveryMode === "WHATSAPP") {
      return this.whatsapp.sendTextMessage(payload.to, payload.text);
    }

    logger.info("Completed notification (log only)", {
      mode: payload.mode,
      to: payload.to,
      orderNo: payload.orderNo,
      resultUrl: payload.resultUrl,
      providerName: payload.providerName,
      text: payload.text
    });

    return { dryRun: true, sent: false };
  }

  async sendOrderReceived(to: string, orderNo: string) {
    return this.whatsapp.sendTextMessage(to, `Order ${orderNo} received. Please continue to payment.`);
  }

  async sendPaymentLink(to: string, checkoutUrl: string) {
    return this.whatsapp.sendTextMessage(to, `Complete your payment here: ${checkoutUrl}`);
  }

  async sendPaymentConfirmed(to: string, orderNo: string) {
    return this.whatsapp.sendTextMessage(to, `Payment confirmed for ${orderNo}. Processing has started.`);
  }

  async sendProcessingStarted(to: string, orderNo: string) {
    return this.whatsapp.sendTextMessage(to, `Processing started for ${orderNo}.`);
  }

  async sendOrderCompleted(to: string, orderNo: string, resultUrl: string) {
    return this.whatsapp.sendTextMessage(to, `Order ${orderNo} completed. Download: ${resultUrl}`);
  }

  async sendOrderFailed(to: string, orderNo: string) {
    return this.whatsapp.sendTextMessage(to, `Order ${orderNo} failed. Our team will retry.`);
  }

  async sendOrderCompletedFromKeys(to: string, orderNo: string, keys: string[]) {
    const first = keys[0];
    if (!first) return this.sendOrderCompleted(to, orderNo, "Files are ready.");
    const signed = await this.storage.getSignedUrl(first);
    return this.sendOrderCompleted(to, orderNo, signed);
  }
}
