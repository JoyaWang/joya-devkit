/**
 * Unit tests for ObjectStorageAdapterFactory.
 */

import { describe, it, expect } from "vitest";
import { ObjectStorageAdapterFactory } from "../packages/object-service/src/adapter-factory.js";
import type { ProjectServiceBinding } from "../packages/project-context/src/types.js";

const now = new Date();

function makeBinding(overrides: Partial<ProjectServiceBinding> = {}): ProjectServiceBinding {
  return {
    id: overrides.id ?? `binding-${overrides.projectKey ?? "infov"}-${overrides.runtimeEnv ?? "dev"}`,
    projectKey: overrides.projectKey ?? "infov",
    runtimeEnv: overrides.runtimeEnv ?? "dev",
    serviceType: overrides.serviceType ?? "object_storage",
    provider: overrides.provider ?? "cos",
    config: overrides.config ?? JSON.stringify({
      bucket: "infov-bucket",
      region: "ap-guangzhou",
      secretId: "test-id",
      secretKey: "test-key",
      signExpiresSeconds: 600,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

describe("ObjectStorageAdapterFactory", () => {
  describe("COS provider", () => {
    it("creates a COS adapter from a valid binding", () => {
      const factory = new ObjectStorageAdapterFactory();
      const binding = makeBinding();
      const adapter = factory.getOrCreate(binding);

      // Test that the adapter works (uses the config-driven path)
      const result = adapter.normalizeObjectKey({
        project: "infov",
        env: "prod",
        domain: "member",
        scope: "avatar",
        entityId: "user_1",
        fileKind: "profile",
        fileName: "head.png",
      });

      expect(result.objectKey).toContain("infov/prod/member/avatar/user_1/profile/");
    });

    it("caches adapters by projectKey:runtimeEnv:serviceType", () => {
      const factory = new ObjectStorageAdapterFactory();
      const binding = makeBinding({ projectKey: "infov", runtimeEnv: "dev" });
      const adapter1 = factory.getOrCreate(binding);
      const adapter2 = factory.getOrCreate(binding);

      expect(adapter1).toBe(adapter2);
    });

    it("returns different adapters for different runtime environments of the same project", () => {
      const factory = new ObjectStorageAdapterFactory();
      const devBinding = makeBinding({ projectKey: "infov", runtimeEnv: "dev", config: JSON.stringify({ bucket: "infov-dev-bucket", region: "ap-guangzhou", secretId: "id1", secretKey: "key1" }) });
      const prodBinding = makeBinding({ projectKey: "infov", runtimeEnv: "prod", config: JSON.stringify({ bucket: "infov-prod-bucket", region: "ap-guangzhou", secretId: "id2", secretKey: "key2" }) });

      const devAdapter = factory.getOrCreate(devBinding);
      const prodAdapter = factory.getOrCreate(prodBinding);

      expect(devAdapter).not.toBe(prodAdapter);
    });

    it("returns different adapters for different projects", () => {
      const factory = new ObjectStorageAdapterFactory();
      const infovBinding = makeBinding({ projectKey: "infov", config: JSON.stringify({ bucket: "infov-bucket", region: "ap-guangzhou", secretId: "id1", secretKey: "key1" }) });
      const laicaiBinding = makeBinding({ projectKey: "laicai", config: JSON.stringify({ bucket: "laicai-bucket", region: "ap-shanghai", secretId: "id2", secretKey: "key2" }) });

      const infovAdapter = factory.getOrCreate(infovBinding);
      const laicaiAdapter = factory.getOrCreate(laicaiBinding);

      expect(infovAdapter).not.toBe(laicaiAdapter);
    });

    it("uses custom download domain from binding config for signed download URLs", async () => {
      const factory = new ObjectStorageAdapterFactory();
      const binding = makeBinding({
        projectKey: "laicai",
        runtimeEnv: "dev",
        config: JSON.stringify({
          bucket: "laicai-storage-dev-1321178972",
          region: "ap-shanghai",
          secretId: "test-id",
          secretKey: "test-key",
          downloadDomain: "https://download.example.com",
        }),
      });

      const adapter = factory.getOrCreate(binding);
      const result = await adapter.createDownloadRequest({
        objectKey: "laicai/dev/release/android/1.0.2+6/apk/2026/04/test.apk",
      });

      expect(result.downloadUrl).toContain("https://download.example.com/");
      expect(result.downloadUrl).not.toContain(".cos.ap-shanghai.myqcloud.com");
    });
  });

  describe("invalid provider", () => {
    it("throws on unknown provider", () => {
      const factory = new ObjectStorageAdapterFactory();
      const binding = makeBinding({ provider: "unknown_provider" });

      expect(() => factory.getOrCreate(binding)).toThrow(
        'Unknown object storage provider: "unknown_provider"',
      );
    });
  });

  describe("invalid config", () => {
    it("throws on incomplete COS config", () => {
      const factory = new ObjectStorageAdapterFactory();
      const binding = makeBinding({
        config: JSON.stringify({ bucket: "test-bucket" }),
      });

      expect(() => factory.getOrCreate(binding)).toThrow(
        "COS provider config must include bucket, region, secretId, and secretKey",
      );
    });
  });

  describe("cache invalidation", () => {
    it("invalidate removes a specific cached adapter for one runtimeEnv only", () => {
      const factory = new ObjectStorageAdapterFactory();
      const devBinding = makeBinding({ projectKey: "infov", runtimeEnv: "dev" });
      const prodBinding = makeBinding({ projectKey: "infov", runtimeEnv: "prod", config: JSON.stringify({ bucket: "infov-prod-bucket", region: "ap-guangzhou", secretId: "id2", secretKey: "key2" }) });

      const devAdapter1 = factory.getOrCreate(devBinding);
      const prodAdapter1 = factory.getOrCreate(prodBinding);
      factory.invalidate("infov", "dev", "object_storage");
      const devAdapter2 = factory.getOrCreate(devBinding);
      const prodAdapter2 = factory.getOrCreate(prodBinding);

      expect(devAdapter1).not.toBe(devAdapter2);
      expect(prodAdapter1).toBe(prodAdapter2);
    });

    it("invalidateAll removes all cached adapters", () => {
      const factory = new ObjectStorageAdapterFactory();
      const infovBinding = makeBinding({ projectKey: "infov", runtimeEnv: "dev" });
      const laicaiBinding = makeBinding({ projectKey: "laicai", runtimeEnv: "dev", config: JSON.stringify({ bucket: "laicai-bucket", region: "ap-shanghai", secretId: "id2", secretKey: "key2" }) });

      const infovAdapter1 = factory.getOrCreate(infovBinding);
      const laicaiAdapter1 = factory.getOrCreate(laicaiBinding);

      factory.invalidateAll();

      const infovAdapter2 = factory.getOrCreate(infovBinding);
      const laicaiAdapter2 = factory.getOrCreate(laicaiBinding);

      expect(infovAdapter1).not.toBe(infovAdapter2);
      expect(laicaiAdapter1).not.toBe(laicaiAdapter2);
    });
  });
});
