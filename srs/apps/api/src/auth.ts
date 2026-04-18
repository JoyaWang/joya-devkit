/**
 * Authentication preHandler hook for Fastify.
 *
 * Extracts Bearer token from Authorization header,
 * validates via EnvTokenValidator, and attaches
 * projectKey + runtimeEnv to the request.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { EnvTokenValidator } from "@srs/auth";

const validator = new EnvTokenValidator();

declare module "fastify" {
  interface FastifyRequest {
    projectKey?: string;
    runtimeEnv?: string;
  }
}

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    await reply.status(401).send({ error: "missing token", message: "Authorization header is required" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    await reply.status(401).send({ error: "invalid token", message: "Expected Bearer token" });
    return;
  }

  const token = parts[1];
  const result = await validator.validate(token);
  if (!result.valid) {
    await reply.status(401).send({ error: result.error, message: "Token validation failed" });
    return;
  }

  request.projectKey = result.projectKey;
  request.runtimeEnv = result.runtimeEnv;
}
