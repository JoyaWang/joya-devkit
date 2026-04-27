/**
 * Authentication routes.
 *
 * POST   /v1/auth/send-code       — send verification code
 * POST   /v1/auth/register        — register a new user
 * POST   /v1/auth/login           — login with phone + password
 * POST   /v1/auth/reset-password  — reset password via verification code
 * POST   /v1/auth/refresh         — refresh access token
 * DELETE /v1/auth/account         — delete account
 * GET    /v1/auth/me              — get current user info
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { getPrisma } from "../db.js";

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.AUTH_JWT_SECRET || "dev-auth-jwt-secret";
const JWT_REFRESH_SECRET = process.env.AUTH_JWT_REFRESH_SECRET || "dev-auth-jwt-refresh-secret";
const JWT_EXPIRES_IN = (process.env.AUTH_JWT_EXPIRES_IN || "15m") as jwt.SignOptions["expiresIn"];
const JWT_REFRESH_EXPIRES_IN = (process.env.AUTH_JWT_REFRESH_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];

// ---------------------------------------------------------------------------
// resolveProjectKey (header + query param fallback)
// ---------------------------------------------------------------------------

function resolveProjectKey(request: FastifyRequest): string | undefined {
  const headerKey = request.headers["x-project-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  const query = request.query as Record<string, string | undefined>;
  if (query.projectKey && query.projectKey.trim().length > 0) {
    return query.projectKey.trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// JWT utilities
// ---------------------------------------------------------------------------

function generateAccessToken(userId: string): string {
  return jwt.sign({ userId, type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function verifyAccessToken(authHeader: string | undefined): { userId: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string; type: string };
    if (payload.type !== "access") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared: generate token pair and persist refresh token
// ---------------------------------------------------------------------------

async function generateTokenPair(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  const prisma = getPrisma();

  await prisma.authRefreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + parseExpiry(JWT_REFRESH_EXPIRES_IN)),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Parse a string like "15m", "7d" into milliseconds.
 */
function parseExpiry(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const num = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "ms": return num;
    case "s": return num * 1000;
    case "m": return num * 60 * 1000;
    case "h": return num * 60 * 60 * 1000;
    case "d": return num * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validatePhone(phone: unknown): string | null {
  if (typeof phone !== "string" || phone.trim().length === 0) return null;
  return phone.trim();
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return null;
  if (password.length < 6 || password.length > 32) return null;
  return password;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const skipAuthConfig = { config: { skipAuth: true } } as any;

  // -----------------------------------------------------------------------
  // POST /v1/auth/send-code
  // -----------------------------------------------------------------------
  app.post(
    "/v1/auth/send-code",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header or projectKey query parameter is required" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const phone = validatePhone(body.phone);
      if (!phone) {
        return reply.status(400).send({ error: "field \"phone\" is required" });
      }

      const prisma = getPrisma();

      // Check cooldown: 60 seconds
      const existing = await prisma.authVerificationCode.findUnique({
        where: { projectKey_phone: { projectKey, phone } },
      });
      if (existing) {
        const elapsed = Date.now() - existing.createdAt.getTime();
        if (elapsed < 60_000) {
          return reply.status(429).send({ error: "Please wait before requesting a new code", retryAfter: Math.ceil((60_000 - elapsed) / 1000) });
        }
      }

      // Generate code (dev mode: fixed "123456")
      const code = process.env.NODE_ENV === "production"
        ? String(Math.floor(100000 + Math.random() * 900000))
        : "123456";

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await prisma.authVerificationCode.upsert({
        where: { projectKey_phone: { projectKey, phone } },
        create: { projectKey, phone, code, expiresAt },
        update: { code, expiresAt, attempts: 0, createdAt: new Date() },
      });

      return reply.status(200).send({ success: true, message: "Verification code sent" });
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/auth/register
  // -----------------------------------------------------------------------
  app.post(
    "/v1/auth/register",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header or projectKey query parameter is required" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const phone = validatePhone(body.phone);
      if (!phone) {
        return reply.status(400).send({ error: "field \"phone\" is required" });
      }

      const password = validatePassword(body.password);
      if (!password) {
        return reply.status(400).send({ error: "field \"password\" is required (6-32 characters)" });
      }

      const prisma = getPrisma();

      // Check if phone already registered
      const existingUser = await prisma.authUser.findUnique({
        where: { projectKey_phone: { projectKey, phone } },
      });
      if (existingUser) {
        return reply.status(409).send({ error: "Phone number already registered" });
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.authUser.create({
        data: {
          projectKey,
          phone,
          passwordHash,
          appVersion: typeof body.appVersion === "string" ? body.appVersion : null,
          devicePlatform: typeof body.devicePlatform === "string" ? body.devicePlatform : null,
        },
      });

      // Generate token pair
      const tokens = await generateTokenPair(user.id);

      return reply.status(201).send({
        success: true,
        data: {
          user: { id: user.id, phone: user.phone, createdAt: user.createdAt.toISOString() },
          tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        },
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/auth/login
  // -----------------------------------------------------------------------
  app.post(
    "/v1/auth/login",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header or projectKey query parameter is required" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const phone = validatePhone(body.phone);
      if (!phone) {
        return reply.status(400).send({ error: "field \"phone\" is required" });
      }

      const password = validatePassword(body.password);
      if (!password) {
        return reply.status(400).send({ error: "field \"password\" is required" });
      }

      const prisma = getPrisma();

      // Find user
      const user = await prisma.authUser.findUnique({
        where: { projectKey_phone: { projectKey, phone } },
      });
      if (!user) {
        return reply.status(401).send({ error: "Invalid phone or password" });
      }

      // Compare password
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid phone or password" });
      }

      // Check user status
      if (user.status !== "ACTIVE") {
        return reply.status(403).send({ error: "Account is disabled" });
      }

      // Update device info if provided
      if (body.appVersion || body.devicePlatform) {
        await prisma.authUser.update({
          where: { id: user.id },
          data: {
            ...(typeof body.appVersion === "string" ? { appVersion: body.appVersion } : {}),
            ...(typeof body.devicePlatform === "string" ? { devicePlatform: body.devicePlatform } : {}),
          },
        });
      }

      // Generate token pair
      const tokens = await generateTokenPair(user.id);

      return reply.status(200).send({
        success: true,
        data: {
          user: { id: user.id, phone: user.phone, createdAt: user.createdAt.toISOString() },
          tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        },
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/auth/reset-password
  // -----------------------------------------------------------------------
  app.post(
    "/v1/auth/reset-password",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header or projectKey query parameter is required" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const phone = validatePhone(body.phone);
      if (!phone) {
        return reply.status(400).send({ error: "field \"phone\" is required" });
      }

      const code = typeof body.code === "string" && body.code.trim().length > 0 ? body.code.trim() : null;
      if (!code) {
        return reply.status(400).send({ error: "field \"code\" is required" });
      }

      const newPassword = validatePassword(body.newPassword);
      if (!newPassword) {
        return reply.status(400).send({ error: "field \"newPassword\" is required (6-32 characters)" });
      }

      const prisma = getPrisma();

      // Verify code
      const verificationCode = await prisma.authVerificationCode.findUnique({
        where: { projectKey_phone: { projectKey, phone } },
      });
      if (!verificationCode) {
        return reply.status(400).send({ error: "Verification code not found. Please request a new one." });
      }

      // Check expiry
      if (verificationCode.expiresAt < new Date()) {
        return reply.status(400).send({ error: "Verification code has expired. Please request a new one." });
      }

      // Check attempts (max 5)
      if (verificationCode.attempts >= 5) {
        return reply.status(400).send({ error: "Too many attempts. Please request a new code." });
      }

      // Increment attempts
      await prisma.authVerificationCode.update({
        where: { id: verificationCode.id },
        data: { attempts: { increment: 1 } },
      });

      // Compare code
      if (verificationCode.code !== code) {
        return reply.status(400).send({ error: "Invalid verification code" });
      }

      // Find user
      const user = await prisma.authUser.findUnique({
        where: { projectKey_phone: { projectKey, phone } },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Update password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.authUser.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      // Delete used verification code
      await prisma.authVerificationCode.delete({
        where: { id: verificationCode.id },
      });

      // Generate new token pair
      const tokens = await generateTokenPair(user.id);

      return reply.status(200).send({
        success: true,
        data: {
          user: { id: user.id, phone: user.phone, createdAt: user.createdAt.toISOString() },
          tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        },
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/auth/refresh
  // -----------------------------------------------------------------------
  app.post(
    "/v1/auth/refresh",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : null;
      if (!refreshToken) {
        return reply.status(400).send({ error: "field \"refreshToken\" is required" });
      }

      // Verify refresh token JWT
      let payload: { userId: string; type: string };
      try {
        payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string; type: string };
        if (payload.type !== "refresh") {
          return reply.status(401).send({ error: "Invalid token type" });
        }
      } catch {
        return reply.status(401).send({ error: "Invalid or expired refresh token" });
      }

      const prisma = getPrisma();
      const tokenHashValue = hashToken(refreshToken);

      // Find stored refresh token
      const storedToken = await prisma.authRefreshToken.findFirst({
        where: { tokenHash: tokenHashValue, userId: payload.userId },
      });
      if (!storedToken) {
        return reply.status(401).send({ error: "Refresh token not found" });
      }

      // Check expiry
      if (storedToken.expiresAt < new Date()) {
        await prisma.authRefreshToken.delete({ where: { id: storedToken.id } });
        return reply.status(401).send({ error: "Refresh token has expired" });
      }

      // Token rotation: delete old refresh token
      await prisma.authRefreshToken.delete({ where: { id: storedToken.id } });

      // Generate new token pair
      const tokens = await generateTokenPair(payload.userId);

      return reply.status(200).send({
        success: true,
        data: {
          tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        },
      });
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /v1/auth/account
  // -----------------------------------------------------------------------
  app.delete(
    "/v1/auth/account",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Internal JWT verification
      const authResult = verifyAccessToken(request.headers.authorization);
      if (!authResult) {
        return reply.status(401).send({ error: "Invalid or missing access token" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const password = validatePassword(body.password);
      if (!password) {
        return reply.status(400).send({ error: "field \"password\" is required" });
      }

      const prisma = getPrisma();

      // Find user
      const user = await prisma.authUser.findUnique({ where: { id: authResult.userId } });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid password" });
      }

      // Delete user (cascade deletes refresh tokens)
      await prisma.authUser.delete({ where: { id: user.id } });

      return reply.status(200).send({ success: true, message: "Account deleted successfully" });
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/auth/me
  // -----------------------------------------------------------------------
  app.get(
    "/v1/auth/me",
    skipAuthConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Internal JWT verification
      const authResult = verifyAccessToken(request.headers.authorization);
      if (!authResult) {
        return reply.status(401).send({ error: "Invalid or missing access token" });
      }

      const prisma = getPrisma();

      const user = await prisma.authUser.findUnique({ where: { id: authResult.userId } });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.status(200).send({
        success: true,
        data: {
          user: { id: user.id, phone: user.phone, createdAt: user.createdAt.toISOString() },
        },
      });
    },
  );
}
