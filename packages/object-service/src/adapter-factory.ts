/**
 * ObjectStorageAdapterFactory -- creates ObjectStorageAdapter instances
 * from project-level service bindings.
 *
 * The factory caches adapters by (projectKey, runtimeEnv, serviceType) so that the same
 * provider instance is reused across requests for the same project environment.
 */

import type { ObjectStorageAdapter } from "./adapter.js";
import { CosObjectStorageAdapter } from "./cos-adapter.js";
import type { CosProviderConfig } from "./cos-adapter.js";
import type { ProjectServiceBinding } from "@srs/project-context";

export class ObjectStorageAdapterFactory {
  private readonly cache = new Map<string, ObjectStorageAdapter>();

  /**
   * Get or create an ObjectStorageAdapter for the given binding.
   *
   * The adapter is cached by `${projectKey}:${runtimeEnv}:${serviceType}`.
   */
  getOrCreate(binding: ProjectServiceBinding): ObjectStorageAdapter {
    const cacheKey = `${binding.projectKey}:${binding.runtimeEnv}:${binding.serviceType}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const adapter = this.createAdapter(binding);
    this.cache.set(cacheKey, adapter);
    return adapter;
  }

  /**
   * Clear a specific cached adapter (useful when binding config changes).
   */
  invalidate(projectKey: string, runtimeEnv: string, serviceType: string): void {
    this.cache.delete(`${projectKey}:${runtimeEnv}:${serviceType}`);
  }

  /**
   * Clear all cached adapters.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  private createAdapter(binding: ProjectServiceBinding): ObjectStorageAdapter {
    switch (binding.provider) {
      case "cos": {
        const config = this.parseCosConfig(binding.config);
        return new CosObjectStorageAdapter({ config });
      }
      case "minio":
        // Placeholder for future MinIO support
        throw new Error(`Provider "minio" is not yet supported by the adapter factory`);
      default:
        throw new Error(`Unknown object storage provider: "${binding.provider}"`);
    }
  }

  private parseCosConfig(json: string): CosProviderConfig {
    const parsed = JSON.parse(json);
    if (!parsed.bucket || !parsed.region || !parsed.secretId || !parsed.secretKey) {
      throw new Error(
        "COS provider config must include bucket, region, secretId, and secretKey",
      );
    }
    return {
      bucket: parsed.bucket,
      region: parsed.region,
      secretId: parsed.secretId,
      secretKey: parsed.secretKey,
      signExpiresSeconds: parsed.signExpiresSeconds,
    };
  }
}
