/**
 * Shared public delivery entrypoint.
 *
 * Handles stable public URLs behind shared hosts:
 * - dl-dev.infinex.cn
 * - dl.infinex.cn
 *
 * Behavior:
 * - only active + public-stable objects are eligible
 * - host/env must match (dl-dev => dev/staging, dl => prod/prd)
 * - resolves provider binding from object.projectKey + object.env
 * - redirects to provider download URL so the stable public host is decoupled
 *   from the underlying provider host
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validateObjectKeyFormat } from "@srs/object-service";
import type { ProjectContextResolver } from "@srs/project-context";
import type { ObjectStorageAdapterFactory } from "@srs/object-service";
import { getPrisma } from "../db.js";
import { resolveReadableDownloadFromBindings } from "./read-binding-download.js";
import { resolveCandidateReadBindings } from "./read-location-candidates.js";

interface PublicDeliveryRouteDeps {
  resolver: ProjectContextResolver;
  factory: ObjectStorageAdapterFactory;
}

interface PublicDeliveryParams {
  "*": string;
}

function normalizeHost(hostname?: string): string {
  return (hostname || "").toLowerCase();
}

function resolveEffectiveHost(request: FastifyRequest): string {
  const headers = request.headers || {};
  const acceleratedHost = headers["tencent-acceleration-domain-name"];
  const forwardedHost = Array.isArray(acceleratedHost)
    ? acceleratedHost[0]
    : acceleratedHost;

  if (typeof forwardedHost === "string" && forwardedHost.trim()) {
    return normalizeHost(forwardedHost.trim());
  }

  return normalizeHost((request as any).hostname || request.headers.host);
}

function isAllowedHost(hostname: string): boolean {
  return hostname === "dl-dev.infinex.cn" || hostname === "dl.infinex.cn";
}

function hostMatchesEnv(hostname: string, objectEnv: string): boolean {
  if (hostname === "dl.infinex.cn") {
    return objectEnv === "prod" || objectEnv === "prd";
  }
  if (hostname === "dl-dev.infinex.cn") {
    return objectEnv === "dev" || objectEnv === "staging";
  }
  return false;
}

export async function registerPublicDeliveryRoute(
  app: FastifyInstance,
  deps: PublicDeliveryRouteDeps,
): Promise<void> {
  app.get(
    "/*",
    {
      constraints: {
        host: /^(dl-dev|dl)\.infinex\.cn$/,
      },
      config: {
        skipAuth: true,
      },
    },
    async (
      request: FastifyRequest<{ Params: PublicDeliveryParams }>,
      reply: FastifyReply,
    ) => {
      const hostname = resolveEffectiveHost(request);
      if (!isAllowedHost(hostname)) {
        return reply.status(404).send({ error: "host_not_supported" });
      }

      const objectKey = request.params["*"];
      if (!objectKey) {
        return reply.status(400).send({ error: 'field "objectKey" is required' });
      }

      const formatResult = validateObjectKeyFormat(objectKey);
      if (!formatResult.valid) {
        return reply.status(400).send({ error: formatResult.error });
      }

      const prisma = getPrisma();
      const objectRecord = await prisma.object.findUnique({
        where: { objectKey },
      });

      if (!objectRecord) {
        return reply.status(404).send({ error: "object not found" });
      }

      if (objectRecord.status === "deleted") {
        return reply.status(410).send({ error: "object has been deleted" });
      }

      if (objectRecord.accessClass !== "public-stable") {
        return reply.status(403).send({ error: "object is not publicly deliverable" });
      }

      if (!hostMatchesEnv(hostname, objectRecord.env)) {
        return reply.status(403).send({
          error: "env_mismatch",
          message: `host "${hostname}" does not match object env "${objectRecord.env}"`,
        });
      }

      const candidateBindings = await resolveCandidateReadBindings(
        {
          id: objectRecord.id,
          projectKey: objectRecord.projectKey,
          env: objectRecord.env,
        },
        prisma,
        deps.resolver,
      );
      const signedResult = await resolveReadableDownloadFromBindings({
        objectKey,
        candidateBindings,
        factory: deps.factory,
      });

      if (!signedResult) {
        return reply.status(404).send({
          error: "object not found",
          debug: {
            objectKey,
            candidateCount: candidateBindings.length,
            bindings: candidateBindings.map(b => ({ id: b.id, config: b.config })),
          }
        });
      }

      reply.header("Cache-Control", "no-store");
      return reply.code(302).redirect(signedResult.downloadUrl);
    },
  );
}
