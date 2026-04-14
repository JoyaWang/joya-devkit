/**
 * POST /v1/objects/download-requests
 *
 * Request a download URL for an existing object.
 *
 * Access class routing:
 * - public-stable: returns stable public URL via DeliveryPolicyResolver
 * - private-signed / internal-signed: continues using adapter.createDownloadRequest()
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateObjectKeyFormat } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import { ProjectContextError } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { DeliveryPolicyResolver } from "@srs/delivery-policy";
import { getPrisma } from "../db.js";
import { resolveReadableDownloadFromBindings } from "./read-binding-download.js";
import { resolveCandidateReadBindings } from "./read-location-candidates.js";

interface DownloadRequestBody {
  objectKey: string;
}

export interface DownloadRequestsRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
  deliveryResolver: DeliveryPolicyResolver;
}

export async function registerDownloadRequestsRoute(
  app: FastifyInstance,
  deps: DownloadRequestsRouteDeps,
): Promise<void> {
  app.post(
    "/v1/objects/download-requests",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      const runtimeEnv = request.runtimeEnv;
      if (!projectKey || !runtimeEnv) {
        return reply.status(401).send({ error: "unauthorized" });
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

      const [, objectEnv] = body.objectKey.split("/");
      if (objectEnv !== runtimeEnv) {
        return reply.status(403).send({
          error: "env_mismatch",
          message: `objectKey env "${objectEnv}" does not match authenticated runtimeEnv "${runtimeEnv}"`,
        });
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

      let candidateBindings;
      try {
        candidateBindings = await resolveCandidateReadBindings(
          {
            id: objectRecord.id,
            projectKey: objectRecord.projectKey,
            env: objectRecord.env,
          },
          prisma,
          deps.resolver,
        );
        if (!candidateBindings[0]) {
          return reply.status(500).send({ error: "read_binding_missing" });
        }
      } catch (err) {
        if (err instanceof ProjectContextError) {
          return reply.status(err.statusCode).send({
            error: err.code,
            message: err.message,
          });
        }
        throw err;
      }

      // Access class routing
      const accessClass = objectRecord.accessClass || "private-signed";

      let downloadUrl: string;
      let expiresAt: string | undefined;

      if (accessClass === "public-stable") {
        // public-stable objects: return stable public URL via DeliveryPolicyResolver
        const result = deps.deliveryResolver.resolve({
          env: runtimeEnv as "dev" | "staging" | "prod",
          accessClass,
          objectKey: body.objectKey,
          objectProfile: objectRecord.objectProfile || undefined,
        });

        if (result.type === "public_url" && result.url) {
          downloadUrl = result.url;
          // Public URLs don't expire (or have long TTL)
          expiresAt = undefined;
        } else {
          return reply.status(500).send({ error: "public_delivery_policy_invalid" });
        }
      } else {
        // private-signed / internal-signed: continue using adapter.createDownloadRequest()
        const signedResult = await resolveReadableDownloadFromBindings({
          objectKey: body.objectKey,
          candidateBindings,
          factory: deps.factory,
        });

        if (!signedResult) {
          return reply.status(404).send({ error: "object not found" });
        }

        downloadUrl = signedResult.downloadUrl;
        expiresAt = signedResult.expiresAt;
      }

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "create_download_request",
          actorType: "service_token",
          actorId: projectKey,
          resource: `object:${body.objectKey}`,
          detail: JSON.stringify({ fileName: objectRecord.fileName, accessClass }),
        },
      });

      return reply.status(200).send({
        downloadUrl,
        ...(expiresAt && { expiresAt }),
      });
    },
  );
}
