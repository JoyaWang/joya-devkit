/**
 * Unit tests for ProjectContextResolver.
 */

import { describe, it, expect } from "vitest";
import { ProjectContextResolver } from "../packages/project-context/src/resolver.js";
import type { ProjectDatabaseClient } from "../packages/project-context/src/resolver.js";
import {
  ProjectContextError,
} from "../packages/project-context/src/errors.js";

function buildFakeDb(overrides: {
  manifest?: Record<string, { projectKey: string; displayName: string; status: string; createdAt: Date; updatedAt: Date }>;
  binding?: Record<string, { projectKey: string; serviceType: string; provider: string; config: string; createdAt: Date; updatedAt: Date }>;
}): ProjectDatabaseClient {
  return {
    projectManifest: {
      findUnique: async ({ where: { projectKey } }) => {
        const row = overrides.manifest?.[projectKey];
        return row ?? null;
      },
    },
    projectServiceBinding: {
      findUnique: async ({ where: { projectKey_serviceType: { projectKey, serviceType } } }) => {
        const key = `${projectKey}:${serviceType}`;
        const row = overrides.binding?.[key];
        return row ?? null;
      },
    },
  };
}

const now = new Date();

describe("ProjectContextResolver", () => {
  describe("successful resolution", () => {
    it("resolves a registered active project with object_storage binding", async () => {
      const db = buildFakeDb({
        manifest: {
          infov: { projectKey: "infov", displayName: "InfoV", status: "active", createdAt: now, updatedAt: now },
        },
        binding: {
          "infov:object_storage": {
            projectKey: "infov",
            serviceType: "object_storage",
            provider: "cos",
            config: JSON.stringify({ bucket: "infov-bucket", region: "ap-guangzhou", secretId: "id", secretKey: "key" }),
            createdAt: now,
            updatedAt: now,
          },
        },
      });

      const resolver = new ProjectContextResolver(db);
      const ctx = await resolver.resolve("infov", "object_storage");

      expect(ctx.manifest.projectKey).toBe("infov");
      expect(ctx.manifest.status).toBe("active");
      expect(ctx.binding.provider).toBe("cos");
      expect(ctx.binding.config).toContain("infov-bucket");
    });
  });

  describe("error cases", () => {
    it("throws project_not_registered (422) when no manifest exists", async () => {
      const db = buildFakeDb({ manifest: {}, binding: {} });
      const resolver = new ProjectContextResolver(db);

      try {
        await resolver.resolve("unknown", "object_storage");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectContextError);
        const e = err as ProjectContextError;
        expect(e.code).toBe("project_not_registered");
        expect(e.statusCode).toBe(422);
        expect(e.projectKey).toBe("unknown");
      }
    });

    it("throws project_inactive (403) when manifest status is not active", async () => {
      const db = buildFakeDb({
        manifest: {
          suspended: { projectKey: "suspended", displayName: "Suspended", status: "inactive", createdAt: now, updatedAt: now },
        },
        binding: {},
      });
      const resolver = new ProjectContextResolver(db);

      try {
        await resolver.resolve("suspended", "object_storage");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectContextError);
        const e = err as ProjectContextError;
        expect(e.code).toBe("project_inactive");
        expect(e.statusCode).toBe(403);
      }
    });

    it("throws service_binding_missing (422) when no binding for the service type", async () => {
      const db = buildFakeDb({
        manifest: {
          infov: { projectKey: "infov", displayName: "InfoV", status: "active", createdAt: now, updatedAt: now },
        },
        binding: {},
      });
      const resolver = new ProjectContextResolver(db);

      try {
        await resolver.resolve("infov", "object_storage");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectContextError);
        const e = err as ProjectContextError;
        expect(e.code).toBe("service_binding_missing");
        expect(e.statusCode).toBe(422);
        expect(e.serviceType).toBe("object_storage");
      }
    });
  });

  describe("multiple projects", () => {
    it("resolves different bindings for different projects", async () => {
      const db = buildFakeDb({
        manifest: {
          infov: { projectKey: "infov", displayName: "InfoV", status: "active", createdAt: now, updatedAt: now },
          laicai: { projectKey: "laicai", displayName: "Laicai", status: "active", createdAt: now, updatedAt: now },
        },
        binding: {
          "infov:object_storage": {
            projectKey: "infov",
            serviceType: "object_storage",
            provider: "cos",
            config: JSON.stringify({ bucket: "infov-bucket", region: "ap-guangzhou", secretId: "id1", secretKey: "key1" }),
            createdAt: now,
            updatedAt: now,
          },
          "laicai:object_storage": {
            projectKey: "laicai",
            serviceType: "object_storage",
            provider: "cos",
            config: JSON.stringify({ bucket: "laicai-bucket", region: "ap-shanghai", secretId: "id2", secretKey: "key2" }),
            createdAt: now,
            updatedAt: now,
          },
        },
      });

      const resolver = new ProjectContextResolver(db);
      const infovCtx = await resolver.resolve("infov", "object_storage");
      const laicaiCtx = await resolver.resolve("laicai", "object_storage");

      expect(infovCtx.binding.config).toContain("infov-bucket");
      expect(laicaiCtx.binding.config).toContain("laicai-bucket");
    });
  });
});
