import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";

export type AdminRole = "SUPER_ADMIN" | "OPERATIONS" | "FINANCE" | "SUPPORT" | "READ_ONLY";

export type AdminJwtPayload = {
  sub: string;
  email: string;
  sid: string;
  role: AdminRole;
};

export const normalizeAdminRole = (role: string | undefined): AdminRole => {
  const normalized = String(role || "").toUpperCase();
  if (["SUPER_ADMIN", "OPERATIONS", "FINANCE", "SUPPORT", "READ_ONLY"].includes(normalized)) {
    return normalized as AdminRole;
  }
  return "READ_ONLY";
};

export class AdminAuthService {
  constructor(private readonly config: AppConfig) {}

  async login(email: string, password: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }
    if (password !== process.env.ADMIN_BOOTSTRAP_PASSWORD) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }
    const sessionId = randomUUID();
    const payload: AdminJwtPayload = { sub: admin.id, email: admin.email, sid: sessionId, role: admin.role };
    const token = this.signToken(payload);
    const refreshToken = this.signRefreshToken(payload);
    await this.createSession(admin.id, refreshToken);
    return { user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role }, token, refreshToken, expiresIn: "7d" };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const session = await prisma.adminSession.findUnique({ where: { refreshTokenHash: refreshToken, expiresAt: { gte: new Date() } } });
    if (!session || session.adminUserId !== payload.sub) {
      throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
    }
    const newPayload: AdminJwtPayload = { sub: payload.sub, email: payload.email, sid: session.id, role: payload.role };
    const newRefreshToken = this.signRefreshToken(newPayload);
    await this.updateSession(session.id, newRefreshToken);
    return { token: this.signToken(newPayload), refreshToken: newRefreshToken, expiresIn: "7d" };
  }

  async logout(refreshToken: string) {
    await prisma.adminSession.update({ where: { refreshTokenHash: refreshToken }, data: { revokedAt: new Date() } }).catch(() => {});
  }

  async getAdminById(id: string) {
    const admin = await prisma.adminUser.findUnique({ where: { id } });
    if (!admin) throw new AppError("Admin not found", 404, "ADMIN_NOT_FOUND");
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  }

  async createSession(adminUserId: string, refreshToken: string) {
    await prisma.adminSession.create({
      data: {
        adminUserId,
        refreshTokenHash: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  }

  async updateSession(sessionId: string, newRefreshToken: string) {
    await prisma.adminSession.update({ where: { id: sessionId }, data: { refreshTokenHash: newRefreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  }

  async findSessionById(sessionId: string) {
    return prisma.adminSession.findUnique({ where: { id: sessionId } });
  }

  async bootstrapFirstAdmin(input: { email: string; password: string; name?: string; role: AdminRole }) {
    const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
    if (existing) return existing;
    return prisma.adminUser.create({
      data: {
        email: input.email,
        passwordHash: "bootstrap",
        name: input.name,
        role: input.role,
        isActive: true
      }
    });
  }

  private signToken(payload: AdminJwtPayload): string {
    return jwt.sign(payload, this.config.ADMIN_JWT_SECRET, { expiresIn: "7d" });
  }

  private signRefreshToken(payload: AdminJwtPayload): string {
    return jwt.sign(payload, this.config.ADMIN_JWT_SECRET, { expiresIn: "7d" });
  }

  private verifyRefreshToken(token: string): AdminJwtPayload {
    return jwt.verify(token, this.config.ADMIN_JWT_SECRET) as AdminJwtPayload;
  }
}