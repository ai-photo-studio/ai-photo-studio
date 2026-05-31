import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const packages = [
    {
      code: "FREE_PREVIEW",
      name: "Free Preview",
      description: "One low-res watermarked preview image",
      price: "0.00",
      includesJson: {
        services: ["background_removal", "watermarked_preview"]
      }
    },
    {
      code: "BASIC_PACK",
      name: "Basic Pack",
      description: "Background removal and white background",
      price: "1499.00",
      includesJson: {
        services: ["background_removal", "white_background"]
      }
    },
    {
      code: "SELLER_READY",
      name: "Seller Ready Pack",
      description: "Background removal, white background, resize, brightness",
      price: "3499.00",
      includesJson: {
        services: ["background_removal", "white_background", "resize", "brightness"]
      }
    },
    {
      code: "PREMIUM_LAUNCH",
      name: "Premium Launch Pack",
      description: "Background removal, static template, resize, brightness",
      price: "6999.00",
      includesJson: {
        services: ["background_removal", "static_template", "resize", "brightness"]
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
        includesJson: item.includesJson
      },
      create: {
        code: item.code,
        name: item.name,
        description: item.description,
        price: item.price,
        includesJson: item.includesJson
      }
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
