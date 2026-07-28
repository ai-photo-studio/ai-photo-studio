import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
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

  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<{ dryRun: boolean; sent: boolean }> {
    if (this.config.whatsappDryRun) {
      logger.info("WhatsApp dry-run: skipped sendImageMessage", { to, imageUrl: imageUrl.slice(0, 80), caption });
      return { dryRun: true, sent: false };
    }

    const phoneNumberId = this.config.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = this.config.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      throw new AppError("WhatsApp image send is not configured", 503, "WHATSAPP_IMAGE_SEND_UNAVAILABLE");
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: imageUrl,
          ...(caption ? { caption } : {})
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("WhatsApp sendImageMessage failed", { to, status: response.status });
      throw new AppError(`WhatsApp image send failed: ${body.slice(0, 200)}`, 502, "WHATSAPP_IMAGE_SEND_FAILED");
    }

    logger.info("WhatsApp sendImageMessage executed", { to });
    return { dryRun: false, sent: true };
  }

  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const accessToken = this.config.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken || this.config.whatsappDryRun) {
      throw new AppError("WhatsApp media download is not configured", 503, "WHATSAPP_DOWNLOAD_UNAVAILABLE");
    }

    const metadataResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!metadataResponse.ok) {
      const body = await metadataResponse.text();
      throw new AppError(`WhatsApp media metadata fetch failed: ${body.slice(0, 200)}`, 502, "WHATSAPP_MEDIA_METADATA_FAILED");
    }

    const metadata = (await metadataResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_name?: string;
    };

    if (!metadata.url) {
      throw new AppError("WhatsApp media download URL missing", 502, "WHATSAPP_MEDIA_URL_MISSING");
    }

    const downloadResponse = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!downloadResponse.ok) {
      const body = await downloadResponse.text();
      throw new AppError(`WhatsApp media download failed: ${body.slice(0, 200)}`, 502, "WHATSAPP_MEDIA_DOWNLOAD_FAILED");
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const mimeType = metadata.mime_type || downloadResponse.headers.get("content-type") || "image/jpeg";
    const fileName = metadata.file_name || `${mediaId}.jpg`;

    logger.info("WhatsApp media downloaded", { mediaId, mimeType, fileName });
    return { buffer: Buffer.from(arrayBuffer), mimeType, fileName };
  }

  async recordWebhookEventPlaceholder(payload: unknown): Promise<void> {
    // DB persistence will be connected once Prisma repositories are wired.
    const entryCount = Array.isArray((payload as any)?.entry) ? (payload as any).entry.length : 0;
    logger.info("Webhook event recorded (placeholder)", { entryCount });
  }
}
