/**
 * POST /v1/objects/download-requests
 *
 * Request a signed download URL for an existing object.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateObjectKeyFormat } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import { ProjectContextError } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { getPrisma } from "../db.js";

interface DownloadRequestBody {
  objectKey: string;
}

export interface DownloadRequestsRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
}

export async function registerDownloadRequestsRoute(
  app: FastifyInstance,
  deps: DownloadRequestsRouteDeps,
): Promise<void> {
  app.post(
    "/v1/objects/download-requests",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      // Resolve project binding
      let adapter;
      try {
        const ctx = await deps.resolver.resolve(projectKey, "object_storage");
        adapter = deps.factory.getOrCreate(ctx.binding);
      } catch (err) {
        if (err instanceof ProjectContextError) {
          return reply.status(err.statusCode).send({
            error: err.code,
            message: err.message,
          });
        }
        throw err;
      }

      const body = request.body as Partial<DownloadRequestBody>;
      if (!body || !body.objectKey) {
        return reply.status(400).send({ error: "field \"objectKey\" is required" });
      }

      // Validate objectKey format
      const formatResult = validateObjectKeyFormat(body.objectKey);
      if (!formatResult.valid) {
        return reply.status(400).send({ error: formatResult.error });
      }

      // Check object exists in DB and belongs to this project
      const prisma = getPrisma();
      const objectRecord = await prisma.object.findUnique({
        where: { objectKey: body.objectKey },
      });

      if (!objectRecord) {
        return reply.status(404).send({ error: "object not found" });
      }

      if (objectRecord.projectKey !== projectKey) {
        return reply.status(403).send({ error: "object does not belong to this project" });
      }

      if (objectRecord.status === "deleted") {
        return reply.status(410).send({ error: "object has been deleted" });
      }

      // Generate download URL via adapter
      const downloadResult = await adapter.createDownloadRequest({
        objectKey: body.objectKey,
      });

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "create_download_request",
          actorType: "service_token",
          actorId: projectKey,
          resource: `object:${body.objectKey}`,
          detail: JSON.stringify({ fileName: objectRecord.fileName }),
        },
      });

      return reply.status(200).send({
        downloadUrl: downloadResult.downloadUrl,
        expiresAt: downloadResult.expiresAt,
      });
    },
  );
}
