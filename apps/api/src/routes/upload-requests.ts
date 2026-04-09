/**
 * POST /v1/objects/upload-requests
 *
 * Request upload URL for object storage.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateScope } from "@srs/object-service";
import type { NormalizeObjectKeyInput } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import { ProjectContextError } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { getPrisma } from "../db.js";

interface UploadRequestBody {
  project: string;
  env: string;
  domain: string;
  scope: string;
  entityId: string;
  fileKind: string;
  fileName: string;
  contentType: string;
  size: number;
  checksum?: string;
  purpose?: string;
}

const REQUIRED_FIELDS: (keyof UploadRequestBody)[] = [
  "project", "env", "domain", "scope", "entityId",
  "fileKind", "fileName", "contentType", "size",
];

export interface UploadRequestsRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
}

export async function registerUploadRequestsRoute(
  app: FastifyInstance,
  deps: UploadRequestsRouteDeps,
): Promise<void> {
  app.post(
    "/v1/objects/upload-requests",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      const runtimeEnv = request.runtimeEnv;
      if (!projectKey || !runtimeEnv) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as Partial<UploadRequestBody>;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      // Validate required fields
      for (const field of REQUIRED_FIELDS) {
        if (body[field] === undefined || body[field] === null || body[field] === "") {
          return reply.status(400).send({ error: `field "${field}" is required` });
        }
      }

      if (typeof body.size !== "number" || body.size <= 0) {
        return reply.status(400).send({ error: "field \"size\" must be a positive number" });
      }

      // Project consistency check: body.project must match token's projectKey
      if (body.project! !== projectKey) {
        return reply.status(403).send({
          error: "project_mismatch",
          message: `body.project "${body.project}" does not match authenticated project "${projectKey}"`,
        });
      }

      if (body.env! !== runtimeEnv) {
        return reply.status(403).send({
          error: "env_mismatch",
          message: `body.env "${body.env}" does not match authenticated runtimeEnv "${runtimeEnv}"`,
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

      // Scope validation
      const scopeResult = validateScope(body.scope!, body.domain!);
      if (!scopeResult.valid) {
        return reply.status(400).send({ error: scopeResult.error });
      }

      // Generate objectKey using token's projectKey + runtimeEnv as the source of truth
      const objectKeyInput: NormalizeObjectKeyInput = {
        project: projectKey,
        env: runtimeEnv,
        domain: body.domain!,
        scope: body.scope!,
        entityId: body.entityId!,
        fileKind: body.fileKind!,
        fileName: body.fileName!,
      };
      const { objectKey } = adapter.normalizeObjectKey(objectKeyInput);

      // Create upload request via adapter
      const uploadResult = await adapter.createUploadRequest({
        objectKey,
        contentType: body.contentType!,
        size: body.size!,
        checksum: body.checksum,
      });

      // Write to database
      const prisma = getPrisma();
      await prisma.object.create({
        data: {
          projectKey,
          env: runtimeEnv,
          domain: body.domain!,
          scope: body.scope!,
          entityId: body.entityId!,
          fileKind: body.fileKind!,
          objectKey,
          fileName: body.fileName!,
          contentType: body.contentType!,
          size: body.size!,
          checksum: body.checksum ?? null,
          visibility: "private",
          uploaderType: "service_token",
          uploaderId: projectKey,
          status: "pending_upload",
          purpose: body.purpose ?? null,
        },
      });

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "create_upload_request",
          actorType: "service_token",
          actorId: projectKey,
          resource: `object:${objectKey}`,
          detail: JSON.stringify({
            scope: body.scope,
            domain: body.domain,
            fileName: body.fileName,
            size: body.size,
          }),
        },
      });

      return reply.status(201).send({
        objectKey: uploadResult.objectKey,
        uploadUrl: uploadResult.uploadUrl,
        requiredHeaders: uploadResult.requiredHeaders,
        expiresAt: uploadResult.expiresAt,
      });
    },
  );
}
