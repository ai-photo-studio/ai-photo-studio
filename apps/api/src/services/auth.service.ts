import crypto from "node:crypto";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const HASH_ITERATIONS = 100000;
const DIGEST = "sha512";

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = stored.split(":");
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return derived === hash;
};

export class AuthService {
  async register(email: string, password: string, name?: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new AppError("Email already registered", 409, "EMAIL_EXISTS");
    }

    const passwordHash = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() || null
      }
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    return { id: user.id, email: user.email, name: user.name };
  }

  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }
    return { id: user.id, email: user.email, name: user.name, customerId: user.customerId };
  }
}
