import { prisma } from "../db/prisma";

const slugToCode = (slug: string): string => slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");

const packageReadSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  price: true,
  currency: true,
  active: true,
  sortOrder: true,
  maxImages: true,
  creditsIncluded: true,
  monthlyCreditLimit: true,
  workflowType: true,
  workflowMode: true,
  includesJson: true,
  createdAt: true,
  updatedAt: true,
  sampleAssets: true
} as const;

const hydratePackage = <T extends { sampleAssets: unknown }>(pkg: T) =>
  ({
    ...pkg,
    featured: false
  }) as T & { featured: boolean };

export class PackageService {
  async findActiveBySlug(packageSlug: string) {
    const normalized = slugToCode(packageSlug);
    const packageRecord = await prisma.package.findFirst({
      where: {
        active: true,
        OR: [{ code: normalized }, { name: { equals: packageSlug, mode: "insensitive" } }]
      },
      select: packageReadSelect
    });

    return packageRecord ? hydratePackage(packageRecord) : null;
  }

  async findDefaultActive() {
    const packageRecord = await prisma.package.findFirst({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: packageReadSelect
    });

    return packageRecord ? hydratePackage(packageRecord) : null;
  }

  async listPublicPackages() {
    const packages = await prisma.package.findMany({
      where: { active: true },
      select: {
        ...packageReadSelect,
        sampleAssets: { where: { active: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }]
    });

    return packages.map(hydratePackage);
  }

  async listAdminPackages() {
    const packages = await prisma.package.findMany({
      select: {
        ...packageReadSelect,
        sampleAssets: true,
        orders: { take: 3, orderBy: { createdAt: "desc" } }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return packages.map(hydratePackage);
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
