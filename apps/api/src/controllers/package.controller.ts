import type { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { toErrorMessage } from "../utils/errors";

export class PackageController {
  listPackages = async (_req: Request, res: Response): Promise<void> => {
    try {
      const packages = await prisma.package.findMany({
        where: { active: true },
        include: {
          sampleAssets: { where: { active: true } }
        },
        orderBy: { price: "asc" }
      });
      res.json({ success: true, data: packages });
    } catch (error) {
      res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
    }
  };
}
