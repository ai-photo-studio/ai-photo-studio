import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { AuthService, verifyPassword } from "../services/auth.service";
import { signToken, signRefreshToken, verifyToken } from "../middleware/auth.middleware";

export class AuthController {
  private readonly authService = new AuthService();

  constructor(private readonly config: AppConfig) {}

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name } = req.body ?? {};
      if (!email || !password) {
        throw new AppError("email and password are required", 400, "INVALID_REQUEST");
      }
      if (typeof password !== "string" || password.length < 6) {
        throw new AppError("Password must be at least 6 characters", 400, "WEAK_PASSWORD");
      }

      const user = await this.authService.register(String(email), String(password), name ? String(name) : undefined);
      const payload = { sub: user.id, email: user.email };
      const token = signToken(this.config, payload);
      const refreshToken = signRefreshToken(this.config, payload);

      res.status(201).json({
        success: true,
        data: {
          user,
          token,
          refreshToken,
          expiresIn: "7d"
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        throw new AppError("email and password are required", 400, "INVALID_REQUEST");
      }

      const user = await this.authService.login(String(email), String(password));
      const payload = { sub: user.id, email: user.email };
      const token = signToken(this.config, payload);
      const refreshToken = signRefreshToken(this.config, payload);

      res.json({
        success: true,
        data: {
          user,
          token,
          refreshToken,
          expiresIn: "7d"
        }
      });
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

      const decoded = verifyToken(this.config, String(refreshToken));
      const user = await this.authService.getUserById(decoded.sub);
      const payload = { sub: user.id, email: user.email };
      const newToken = signToken(this.config, payload);
      const newRefreshToken = signRefreshToken(this.config, payload);

      res.json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken,
          expiresIn: "7d"
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
      }
      const user = await this.authService.getUserById(req.user.sub);
      res.json({ success: true, data: user });
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
