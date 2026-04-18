/**
 * GET /v1/audit-logs
 *
 * Query audit logs with optional filters.
 * Supports filtering by action, resource prefix, and date range.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";

export async function registerAuditLogsRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/audit-logs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const query = request.query as Record<string, string | undefined>;
      const action = query.action;
      const resourcePrefix = query.resourcePrefix;
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
      const offset = Math.max(Number(query.offset) || 0, 0);

      const where: Record<string, unknown> = {
        actorId: projectKey,
      };

      if (action) {
        where.action = action;
      }

      if (resourcePrefix) {
        where.resource = { startsWith: resourcePrefix };
      }

      const prisma = getPrisma();
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return reply.status(200).send({
        data: logs.map((log) => ({
          id: log.id,
          action: log.action,
          actorType: log.actorType,
          actorId: log.actorId,
          resource: log.resource,
          detail: log.detail,
          createdAt: log.createdAt.toISOString(),
        })),
        total,
        limit,
        offset,
      });
    }
  );
}
