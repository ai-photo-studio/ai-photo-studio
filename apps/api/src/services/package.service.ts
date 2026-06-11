import { prisma } from "../db/prisma";

const slugToCode = (slug: string): string => slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");

export class PackageService {
  async findActiveBySlug(packageSlug: string) {
    const normalized = slugToCode(packageSlug);
    return prisma.package.findFirst({
      where: {
        active: true,
        OR: [{ code: normalized }, { name: { equals: packageSlug, mode: "insensitive" } }]
      }
    });
  }

  async findDefaultActive() {
    return prisma.package.findFirst({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  async listPublicPackages() {
    return prisma.package.findMany({
      where: { active: true },
      include: {
        sampleAssets: { where: { active: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }]
    });
  }

  async listAdminPackages() {
    return prisma.package.findMany({
      include: {
        sampleAssets: true,
        orders: { take: 3, orderBy: { createdAt: "desc" } }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  async upsertPackage(input: {
    code: string;
    name: string;
    description?: string | null;
    price: string | number;
    currency?: string;
    active?: boolean;
    featured?: boolean;
    sortOrder?: number;
    maxImages?: number | null;
    creditsIncluded?: number;
    monthlyCreditLimit?: number;
    workflowType?: string;
    workflowMode?: string;
    includesJson?: unknown;
  }) {
    const code = slugToCode(input.code);

    return prisma.package.upsert({
      where: { code },
      update: {
        name: input.name,
        description: input.description || null,
        price: String(input.price),
        currency: input.currency || "PKR",
        active: input.active ?? true,
        featured: input.featured ?? false,
        sortOrder: input.sortOrder ?? 0,
        maxImages: input.maxImages ?? null,
        creditsIncluded: input.creditsIncluded ?? 0,
        monthlyCreditLimit: input.monthlyCreditLimit ?? 0,
        workflowType: input.workflowType || "PRODUCT",
        workflowMode: input.workflowMode || "PRODUCT_STUDIO",
        includesJson: input.includesJson as any
      },
      create: {
        code,
        name: input.name,
        description: input.description || null,
        price: String(input.price),
        currency: input.currency || "PKR",
        active: input.active ?? true,
        featured: input.featured ?? false,
        sortOrder: input.sortOrder ?? 0,
        maxImages: input.maxImages ?? null,
        creditsIncluded: input.creditsIncluded ?? 0,
        monthlyCreditLimit: input.monthlyCreditLimit ?? 0,
        workflowType: input.workflowType || "PRODUCT",
        workflowMode: input.workflowMode || "PRODUCT_STUDIO",
        includesJson: input.includesJson as any
      }
    });
  }
}
