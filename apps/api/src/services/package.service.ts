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
      orderBy: { createdAt: "asc" }
    });
  }
}
