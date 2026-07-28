import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/auth.service";

const prisma = new PrismaClient();

async function main() {
  const packages = [
    {
      code: "STARTER",
      name: "Starter",
      description: "Best for new stores that want a clean, fast launch kit",
      price: "1499.00",
      featured: true,
      sortOrder: 1,
      maxImages: 3,
      creditsIncluded: 10,
      monthlyCreditLimit: 10,
      workflowType: "PRODUCT",
      workflowMode: "WHITE_BACKGROUND",
      includesJson: {
        services: ["background_removal", "white_background", "basic_retouch"]
      }
    },
    {
      code: "PRO",
      name: "Pro",
      description: "Popular package for sellers who need polished product visuals",
      price: "3499.00",
      featured: true,
      sortOrder: 2,
      maxImages: 10,
      creditsIncluded: 25,
      monthlyCreditLimit: 25,
      workflowType: "PRODUCT",
      workflowMode: "SHADOW_ENHANCEMENT",
      includesJson: {
        services: ["background_removal", "white_background", "shadow_enhancement", "resize"]
      }
    },
    {
      code: "BUSINESS",
      name: "Business",
      description: "Advanced package for growing brands and campaigns",
      price: "6999.00",
      featured: false,
      sortOrder: 3,
      maxImages: 25,
      creditsIncluded: 60,
      monthlyCreditLimit: 60,
      workflowType: "PRODUCT",
      workflowMode: "PRODUCT_STUDIO",
      includesJson: {
        services: ["background_removal", "product_studio", "resize", "brightness", "batch_support"]
      }
    },
    {
      code: "DEALER",
      name: "Dealer",
      description: "Vehicle-ready package for dealers and inventory teams",
      price: "9999.00",
      featured: false,
      sortOrder: 4,
      maxImages: 50,
      creditsIncluded: 100,
      monthlyCreditLimit: 100,
      workflowType: "VEHICLE",
      workflowMode: "SHOWROOM",
      includesJson: {
        services: ["vehicle_showroom", "premium_road", "dark_studio", "plate_blur"]
      }
    }
  ];

  for (const item of packages) {
    await prisma.package.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        price: item.price,
        featured: item.featured,
        sortOrder: item.sortOrder,
        maxImages: item.maxImages,
        creditsIncluded: item.creditsIncluded,
        monthlyCreditLimit: item.monthlyCreditLimit,
        workflowType: item.workflowType,
        workflowMode: item.workflowMode,
        includesJson: item.includesJson,
        active: true
      },
      create: {
        code: item.code,
        name: item.name,
        description: item.description,
        price: item.price,
        featured: item.featured,
        sortOrder: item.sortOrder,
        maxImages: item.maxImages,
        creditsIncluded: item.creditsIncluded,
        monthlyCreditLimit: item.monthlyCreditLimit,
        workflowType: item.workflowType,
        workflowMode: item.workflowMode,
        includesJson: item.includesJson
      }
    });
  }

  const legacyCodes = ["FREE_PREVIEW", "BASIC_PACK", "SELLER_READY", "PREMIUM_LAUNCH"];
  for (const code of legacyCodes) {
    await prisma.package.updateMany({
      where: { code },
      data: { active: false }
    });
  }

  const sampleServices = [
    "Product Photo Editing",
    "Fashion / Model Photo",
    "Car / Bike Listing Photo",
    "Short Video",
    "Bulk Seller Package"
  ];

  for (const serviceName of sampleServices) {
    await prisma.sampleAsset.upsert({
      where: { id: `sample-${serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
      update: { title: serviceName, type: "service_menu", storageKey: `placeholder/${serviceName}` },
      create: {
        id: `sample-${serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: serviceName,
        type: "service_menu",
        storageKey: `placeholder/${serviceName}`,
        publicUrl: null
      }
    });
  }

  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
    if (bootstrapEmail && bootstrapPassword) {
      await prisma.adminUser.create({
        data: {
          email: bootstrapEmail,
          passwordHash: hashPassword(bootstrapPassword),
          name: process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "Super Admin",
          role: "SUPER_ADMIN",
          isActive: true
        }
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
