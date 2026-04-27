/**
 * Legal document routes.
 *
 * GET /v1/legal/:documentType — retrieve a legal document by type and projectKey
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";

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

const VALID_DOCUMENT_TYPES = ["user-agreement", "privacy-policy"];

export async function registerLegalRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/legal/:documentType",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header or projectKey query parameter is required" });
      }

      const { documentType } = request.params as { documentType: string };
      if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
        return reply.status(400).send({ error: "Invalid document type. Must be 'user-agreement' or 'privacy-policy'" });
      }

      const prisma = getPrisma();
      const dbDocType = documentType.replace("-", "_"); // user-agreement -> user_agreement
      const doc = await prisma.legalDocument.findUnique({
        where: {
          projectKey_documentType: { projectKey, documentType: dbDocType },
        },
      });

      if (!doc) {
        return reply.status(404).send({ error: "Document not found" });
      }

      // Check if JSON format is requested
      const query = request.query as Record<string, string | undefined>;
      if (query.format === "json") {
        return reply.send({
          title: doc.title,
          version: doc.version,
          contentHtml: doc.contentHtml,
          updatedAt: doc.updatedAt,
        });
      }

      // Default: return HTML
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply.send(doc.contentHtml);
    },
  );
}
