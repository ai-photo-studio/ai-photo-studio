import type { Request, Response } from "express";
import { toErrorMessage } from "../utils/errors";
import { PackageService } from "../services/package.service";

export class PackageController {
  private readonly packageService = new PackageService();

  listPackages = async (_req: Request, res: Response): Promise<void> => {
    try {
      const packages = await this.packageService.listPublicPackages();
      res.json({ success: true, data: packages });
    } catch (error) {
      res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
    }
  };
}
