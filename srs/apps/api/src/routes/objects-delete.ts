/**
 * DELETE /v1/objects
 *
 * Delete an object by objectKey.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateObjectKeyFormat } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import { ProjectContextError } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { getPrisma } from "../db.js";
import { normalizeRuntimeEnv } from "@srs/auth";

interface DeleteRequestBody {
  objectKey: string;
}

export interface ObjectsDeleteRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
}

export async function registerObjectsDeleteRoute(
  app: FastifyInstance,
  deps: ObjectsDeleteRouteDeps,
): Promise<void> {
  app.delete(
    "/v1/objects",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      const runtimeEnv = request.runtimeEnv;
      if (!projectKey || !runtimeEnv) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as Partial<DeleteRequestBody>;
      if (!body || !body.objectKey) {
        return reply.status(400).send({ error: "field \"objectKey\" is required" });
      }

      // Validate objectKey format
      const formatResult = validateObjectKeyFormat(body.objectKey);
      if (!formatResult.valid) {
        return reply.status(400).send({ error: formatResult.error });
      }

      const [, rawObjectEnv] = body.objectKey.split("/");
      const objectEnv = normalizeRuntimeEnv(rawObjectEnv);
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
        return reply.status(404).send({ error: "object not found" });
      }

      if (objectRecord.projectKey !== projectKey) {
        return reply.status(403).send({ error: "object does not belong to this project" });
      }

      if (objectRecord.status === "deleted") {
        return reply.status(410).send({ error: "object already deleted" });
      }

      // Delete from storage via adapter
      await adapter.deleteObject({ objectKey: body.objectKey });

      // Soft-delete in DB
      await prisma.object.update({
        where: { objectKey: body.objectKey },
        data: {
          status: "deleted",
          deletedAt: new Date(),
        },
      });

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "delete_object",
          actorType: "service_token",
          actorId: projectKey,
          resource: `object:${body.objectKey}`,
          detail: JSON.stringify({
            previousStatus: objectRecord.status,
            fileName: objectRecord.fileName,
          }),
        },
      });

      return reply.status(200).send({
        objectKey: body.objectKey,
        status: "deleted",
      });
    },
  );
}
