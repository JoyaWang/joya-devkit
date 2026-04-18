/**
 * Tests for DeliveryPolicyResolver.
 *
 * Contract:
 * - public-stable objects should resolve to stable public URLs
 * - private-signed / internal-signed objects should NOT resolve to stable public URLs
 * - Resolution depends on env + accessClass + objectKey pattern
 */

import { describe, expect, it } from "vitest";
import { DeliveryPolicyResolver, type DeliveryPolicyResolverConfig } from "../packages/delivery-policy/src/resolver.js";

describe("DeliveryPolicyResolver", () => {
  const config: DeliveryPolicyResolverConfig = {
    publicStableDomains: {
      dev: "https://dl-dev.infinex.cn",
      staging: "https://dl-dev.infinex.cn",
      prod: "https://dl.infinex.cn",
    },
  };

  const resolver = new DeliveryPolicyResolver(config);

  describe("public-stable access class", () => {
    it("generates dev URL for public-stable object", () => {
      const result = resolver.resolve({
        env: "dev",
        accessClass: "public-stable",
        objectKey: "infov/dev/release/android/1.0.0+100/apk/app-release.apk",
        objectProfile: "release_artifact",
      });

      expect(result.type).toBe("public_url");
      expect(result.url).toBe("https://dl-dev.infinex.cn/infov/dev/release/android/1.0.0+100/apk/app-release.apk");
    });

    it("generates staging URL for public-stable object", () => {
      const result = resolver.resolve({
        env: "staging",
        accessClass: "public-stable",
        objectKey: "infov/staging/release/android/1.0.0+100/apk/app-release.apk",
        objectProfile: "release_artifact",
      });

      expect(result.type).toBe("public_url");
      expect(result.url).toBe("https://dl-dev.infinex.cn/infov/staging/release/android/1.0.0+100/apk/app-release.apk");
    });

    it("generates prod URL for public-stable object", () => {
      const result = resolver.resolve({
        env: "prod",
        accessClass: "public-stable",
        objectKey: "infov/prod/release/android/1.0.0+100/apk/app-release.apk",
        objectProfile: "release_artifact",
      });

      expect(result.type).toBe("public_url");
      expect(result.url).toBe("https://dl.infinex.cn/infov/prod/release/android/1.0.0+100/apk/app-release.apk");
    });
  });

  describe("private-signed access class", () => {
    it("rejects private-signed from public URL generation", () => {
      const result = resolver.resolve({
        env: "prod",
        accessClass: "private-signed",
        objectKey: "infov/prod/private/user-123/profile/avatar.jpg",
        objectProfile: "private_media",
      });

      expect(result.type).toBe("signed_url_only");
      expect(result.url).toBeUndefined();
      expect(result.error).toBe("access_class_not_public_stable");
    });
  });

  describe("internal-signed access class", () => {
    it("rejects internal-signed from public URL generation", () => {
      const result = resolver.resolve({
        env: "prod",
        accessClass: "internal-signed",
        objectKey: "infov/prod/internal/logs/2026-04-10.log",
        objectProfile: "internal_archive",
      });

      expect(result.type).toBe("signed_url_only");
      expect(result.url).toBeUndefined();
      expect(result.error).toBe("access_class_not_public_stable");
    });
  });

  describe("edge cases", () => {
    it("rejects unknown access class", () => {
      const result = resolver.resolve({
        env: "prod",
        accessClass: "unknown_class",
        objectKey: "infov/prod/test/file.bin",
        objectProfile: "release_artifact",
      });

      expect(result.type).toBe("signed_url_only");
      expect(result.error).toBe("access_class_not_public_stable");
    });

    it("rejects missing access class", () => {
      const result = resolver.resolve({
        env: "prod",
        accessClass: "",
        objectKey: "infov/prod/test/file.bin",
        objectProfile: "release_artifact",
      });

      expect(result.type).toBe("signed_url_only");
      expect(result.error).toBe("access_class_not_public_stable");
    });
  });
});
