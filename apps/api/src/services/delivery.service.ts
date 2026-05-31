import type { AppConfig } from "../config/env";
import { WhatsAppService } from "./whatsapp.service";
import { StorageService } from "./storage.service";

export class DeliveryService {
  private readonly whatsapp: WhatsAppService;
  private readonly storage: StorageService;

  constructor(config: AppConfig) {
    this.whatsapp = new WhatsAppService(config);
    this.storage = new StorageService(config);
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
