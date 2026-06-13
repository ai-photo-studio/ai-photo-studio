import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AdminAuthService, type AdminJwtPayload } from "../services/admin-auth.service";
import { AppError, toErrorMessage } from "../utils/errors";

export class AdminAuthController {
  constructor(private readonly config: AppConfig) {}

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        throw new AppError("email and password are required", 400, "INVALID_REQUEST");
      }
      const result = await new AdminAuthService(this.config).login(String(email), String(password));
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken = req.body?.refreshToken as string | undefined;
      if (refreshToken) {
        await new AdminAuthService(this.config).logout(refreshToken);
      }
      res.json({ success: true, data: { loggedOut: true } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
      }
      const admin = await new AdminAuthService(this.config).getAdminById(req.admin.sub);
      res.json({ success: true, data: admin });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body ?? {};
      if (!refreshToken) {
        throw new AppError("refreshToken is required", 400, "INVALID_REQUEST");
      }
      const result = await new AdminAuthService(this.config).refresh(String(refreshToken));
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}