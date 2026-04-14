/**
 * Unit tests for CosObjectStorageAdapter (explicit config mode).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CosObjectStorageAdapter } from "../packages/object-service/src/cos-adapter.js";

type FakeCosClient = {
  getObjectUrl: (options: Record<string, unknown>) => string;
  headObject: (
    options: Record<string, unknown>,
    callback: (error: unknown, data?: { headers?: Record<string, string> }) => void,
  ) => void;
  deleteObject: (
    options: Record<string, unknown>,
    callback: (error: unknown, data?: unknown) => void,
  ) => void;
};

function buildFakeCosClient(overrides: Partial<FakeCosClient> = {}): FakeCosClient {
  return {
    getObjectUrl: (options) => `https://signed.example.com/${String(options.Key)}?method=${String(options.Method)}`,
    headObject: (_options, callback) => {
      callback(null, {
        headers: {
          "content-length": "12345",
          "content-type": "image/png",
          "last-modified": "Tue, 15 Jan 2019 10:00:00 GMT",
        },
      });
    },
    deleteObject: (_options, callback) => {
      callback(null, {});
    },
    ...overrides,
  };
}

describe("CosObjectStorageAdapter", () => {
  beforeEach(() => {
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
    delete process.env.COS_SECRET_ID;
    delete process.env.COS_SECRET_KEY;
    delete process.env.COS_SIGN_EXPIRES_SECONDS;
  });

  describe("normalizeObjectKey", () => {
    it("generates an objectKey matching the expected format", () => {
      const adapter = new CosObjectStorageAdapter();
      const result = adapter.normalizeObjectKey({
        project: "infov",
        env: "prod",
        domain: "member",
        scope: "avatar",
        entityId: "user_123",
        fileKind: "profile",
        fileName: "head.png",
      });
      const parts = result.objectKey.split("/");
      expect(parts.length).toBeGreaterThanOrEqual(9);
      expect(parts[0]).toBe("infov");
      expect(parts[1]).toBe("prod");
      expect(parts[2]).toBe("member");
      expect(parts[3]).toBe("avatar");
      expect(parts[4]).toBe("user_123");
      expect(parts[5]).toBe("profile");
      expect(parts[6]).toMatch(/^\d{4}$/);
      expect(parts[7]).toMatch(/^\d{2}$/);
      expect(parts[8]).toMatch(/.+-.+-head\.png$/);
    });
  });

  describe("placeholder compatibility mode (no config, no env)", () => {
    it("returns a placeholder upload URL when no config and no env credentials", async () => {
      const adapter = new CosObjectStorageAdapter();
      const result = await adapter.createUploadRequest({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
        contentType: "image/png",
        size: 1024,
      });
      expect(result.objectKey).toContain("infov/prod/member/avatar");
      expect(result.uploadUrl).toContain("placeholder-bucket");
      expect(result.expiresAt).toBeDefined();
      expect(result.requiredHeaders).toBeDefined();
      expect(result.requiredHeaders!["Content-Type"]).toBe("image/png");
    });

    it("returns a placeholder download URL when no config and no env credentials", async () => {
      const adapter = new CosObjectStorageAdapter();
      const result = await adapter.createDownloadRequest({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
      });
      expect(result.downloadUrl).toContain("placeholder-bucket");
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe("explicit config mode (project binding driven)", () => {
    it("uses explicit config bucket and region for upload URL", async () => {
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "infov-bucket-1250000000",
          region: "ap-guangzhou",
          secretId: "test-id",
          secretKey: "test-key",
          signExpiresSeconds: 600,
        },
        client: buildFakeCosClient({
          getObjectUrl: (options) => `https://signed.example.com/${String(options.Key)}?method=${String(options.Method)}`,
        }) as never,
      });

      const result = await adapter.createUploadRequest({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
        contentType: "image/png",
        size: 1024,
      });

      expect(result.uploadUrl).toBe(
        "https://signed.example.com/infov/prod/member/avatar/user_123/profile/2026/04/test.png?method=PUT",
      );
    });

    it("uses explicit config bucket and region for download URL", async () => {
      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "infov-bucket-1250000000",
          region: "ap-guangzhou",
          secretId: "test-id",
          secretKey: "test-key",
        },
        client: buildFakeCosClient({
          getObjectUrl: (options) => {
            calls.push(options);
            return `https://signed.example.com/${String(options.Key)}?method=${String(options.Method)}`;
          },
        }) as never,
      });

      const result = await adapter.createDownloadRequest({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
      });

      expect(result.downloadUrl).toBe(
        "https://signed.example.com/infov/prod/member/avatar/user_123/profile/2026/04/test.png?method=GET",
      );
      expect(calls[0]).toMatchObject({
        Bucket: "infov-bucket-1250000000",
        Region: "ap-guangzhou",
      });
    });

    it("passes a custom provider download domain to COS SDK when configured", async () => {
      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "laicai-storage-dev-1321178972",
          region: "ap-shanghai",
          secretId: "test-id",
          secretKey: "test-key",
          downloadDomain: "https://cos-download-dev.infinex.cn",
        },
        client: buildFakeCosClient({
          getObjectUrl: (options) => {
            calls.push(options);
            return `https://cos-download-dev.infinex.cn/${String(options.Key)}?method=${String(options.Method)}`;
          },
        }) as never,
      });

      const result = await adapter.createDownloadRequest({
        objectKey: "laicai/dev/release/android/1.0.2+6/apk/2026/04/test.apk",
      });

      expect(result.downloadUrl).toBe(
        "https://cos-download-dev.infinex.cn/laicai/dev/release/android/1.0.2+6/apk/2026/04/test.apk?method=GET",
      );
      expect(calls[0]).toMatchObject({
        Bucket: "laicai-storage-dev-1321178972",
        Region: "ap-shanghai",
        Domain: "https://cos-download-dev.infinex.cn",
        ForceSignHost: false,
      });
    });

    it("does not force host signing when using a custom provider download domain", async () => {
      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "shared-dev-bucket-1321178972",
          region: "ap-shanghai",
          secretId: "test-id",
          secretKey: "test-key",
          downloadDomain: "https://origin-dev.infinex.cn",
        },
        client: buildFakeCosClient({
          getObjectUrl: (options) => {
            calls.push(options);
            return `https://origin-dev.infinex.cn/${String(options.Key)}?method=${String(options.Method)}`;
          },
        }) as never,
      });

      await adapter.createDownloadRequest({
        objectKey: "infov/dev/release/android/2.0.0+1/apk/2026/04/test.apk",
      });

      expect(calls[0]).toMatchObject({
        Domain: "https://origin-dev.infinex.cn",
        ForceSignHost: false,
      });
    });

    it("rejects shared delivery hosts as provider download domains", () => {
      expect(
        () =>
          new CosObjectStorageAdapter({
            config: {
              bucket: "laicai-storage-dev-1321178972",
              region: "ap-shanghai",
              secretId: "test-id",
              secretKey: "test-key",
              downloadDomain: "https://dl-dev.infinex.cn",
            },
          }),
      ).toThrow("COS provider downloadDomain must not use shared delivery hosts");
    });

    it("uses signExpiresSeconds from config when provided", async () => {
      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "test-bucket",
          region: "ap-shanghai",
          secretId: "id",
          secretKey: "key",
          signExpiresSeconds: 1800,
        },
        client: buildFakeCosClient({
          getObjectUrl: (options) => {
            calls.push(options);
            return `https://signed.example.com/${String(options.Key)}`;
          },
        }) as never,
      });

      await adapter.createUploadRequest({
        objectKey: "test/key.png",
        contentType: "image/png",
        size: 100,
      });

      expect(calls[0]).toMatchObject({ Expires: 1800 });
    });
  });

  describe("legacy env-var mode", () => {
    it("uses COS env vars when config is not provided", async () => {
      process.env.COS_BUCKET = "examplebucket-1250000000";
      process.env.COS_REGION = "ap-shanghai";
      process.env.COS_SECRET_ID = "secret-id";
      process.env.COS_SECRET_KEY = "secret-key";
      process.env.COS_SIGN_EXPIRES_SECONDS = "1200";

      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        client: buildFakeCosClient({
          getObjectUrl: (options) => {
            calls.push(options);
            return `https://signed.example.com/${String(options.Key)}?method=${String(options.Method)}`;
          },
        }) as never,
      });

      const result = await adapter.createUploadRequest({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
        contentType: "image/png",
        size: 1024,
      });

      expect(result.uploadUrl).toBe("https://signed.example.com/infov/prod/member/avatar/user_123/profile/2026/04/test.png?method=PUT");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        Bucket: "examplebucket-1250000000",
        Region: "ap-shanghai",
        Expires: 1200,
      });
    });
  });

  describe("headObject with explicit config", () => {
    it("maps COS headObject metadata into the provider-neutral result", async () => {
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "examplebucket-1250000000",
          region: "ap-shanghai",
          secretId: "secret-id",
          secretKey: "secret-key",
        },
        client: buildFakeCosClient({
          headObject: (_options, callback) => {
            callback(null, {
              headers: {
                "content-length": "12345",
                "content-type": "image/png",
                "last-modified": "Tue, 15 Jan 2019 10:00:00 GMT",
              },
            });
          },
        }) as never,
      });

      const result = await adapter.headObject({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
      });

      expect(result).toEqual({
        exists: true,
        size: 12345,
        contentType: "image/png",
        lastModified: new Date("Tue, 15 Jan 2019 10:00:00 GMT").toISOString(),
      });
    });

    it("treats a missing COS object as exists=false instead of throwing", async () => {
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "examplebucket-1250000000",
          region: "ap-shanghai",
          secretId: "secret-id",
          secretKey: "secret-key",
        },
        client: buildFakeCosClient({
          headObject: (_options, callback) => {
            callback({ statusCode: 404, code: "NoSuchKey" });
          },
        }) as never,
      });

      const result = await adapter.headObject({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/missing.png",
      });

      expect(result).toEqual({ exists: false });
    });
  });

  describe("deleteObject with explicit config", () => {
    it("delegates deleteObject to the COS client", async () => {
      const calls: Record<string, unknown>[] = [];
      const adapter = new CosObjectStorageAdapter({
        config: {
          bucket: "examplebucket-1250000000",
          region: "ap-shanghai",
          secretId: "secret-id",
          secretKey: "secret-key",
        },
        client: buildFakeCosClient({
          deleteObject: (options, callback) => {
            calls.push(options);
            callback(null, {});
          },
        }) as never,
      });

      const result = await adapter.deleteObject({
        objectKey: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        Bucket: "examplebucket-1250000000",
        Region: "ap-shanghai",
        Key: "infov/prod/member/avatar/user_123/profile/2026/04/test.png",
      });
      expect(result).toEqual({ deleted: true });
    });
  });
});
