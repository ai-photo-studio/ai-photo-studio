import { prisma } from "../db/prisma";

export const normalizeWhatsAppNumber = (value: string): string => value.replace(/[^\d+]/g, "").trim();

export class CustomerService {
  async findOrCreateByWhatsAppNumber(whatsappNumber: string) {
    const normalized = normalizeWhatsAppNumber(whatsappNumber);
    return prisma.customer.upsert({
      where: { whatsappNumber: normalized },
      update: {},
      create: { whatsappNumber: normalized }
    });
  }
}
