/**
 * POST /v1/objects/complete
 *
 * Mark an object upload as complete and register its metadata.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateObjectKeyFormat } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import { ProjectContextError } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { getPrisma } from "../db.js";

interface CompleteRequestBody {
  objectKey: string;
  size?: number;
  checksum?: string;
}

export interface CompleteRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
}

export async function registerCompleteRoute(
  app: FastifyInstance,
  deps: CompleteRouteDeps,
): Promise<void> {
  app.post(
    "/v1/objects/complete",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      const runtimeEnv = request.runtimeEnv;
      if (!projectKey || !runtimeEnv) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as Partial<CompleteRequestBody>;
      if (!body || !body.objectKey) {
        return reply.status(400).send({ error: "field \"objectKey\" is required" });
      }

      // Validate objectKey format
      const formatResult = validateObjectKeyFormat(body.objectKey);
      if (!formatResult.valid) {
        return reply.status(400).send({ error: formatResult.error });
      }

      const [, objectEnv] = body.objectKey.split("/");
      if (objectEnv !== runtimeEnv) {
        return reply.status(403).send({
          error: "env_mismatch",
          message: `objectKey env "${objectEnv}" does not match authenticated runtimeEnv "${runtimeEnv}"`,
        });
      }

      // Resolve project binding
      let adapter;
      try {
        const ctx = await deps.resolver.resolve(projectKey, runtimeEnv, "object_storage");
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

      // Find the object in DB
      const prisma = getPrisma();
      const objectRecord = await prisma.object.findUnique({
        where: { objectKey: body.objectKey },
      });

      if (!objectRecord) {
        return reply.status(404).send({ error: "object not found -- upload request must be created first" });
      }

      if (objectRecord.projectKey !== projectKey) {
        return reply.status(403).send({ error: "object does not belong to this project" });
      }

      if (objectRecord.status === "active") {
        return reply.status(409).send({ error: "object already completed" });
      }

      if (objectRecord.status === "deleted") {
        return reply.status(410).send({ error: "object has been deleted" });
      }

      // Optionally verify object exists in storage via adapter headObject
      await adapter.headObject({ objectKey: body.objectKey });

      // Update object status to active, optionally override size/checksum
      const updateData: Record<string, unknown> = {
        status: "active",
      };
      if (body.size !== undefined && body.size > 0) {
        updateData.size = body.size;
      }
      if (body.checksum) {
        updateData.checksum = body.checksum;
      }

      await prisma.object.update({
        where: { objectKey: body.objectKey },
        data: updateData,
      });

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "complete_upload",
          actorType: "service_token",
          actorId: projectKey,
          resource: `object:${body.objectKey}`,
          detail: JSON.stringify({
            previousStatus: objectRecord.status,
            newSize: body.size,
          }),
        },
      });

      return reply.status(200).send({
        objectKey: body.objectKey,
        status: "active",
      });
    },
  );
}
