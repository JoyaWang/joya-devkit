/**
 * CosObjectStorageAdapter -- Tencent Cloud COS adapter.
 *
 * Key constraint: this file is the ONLY place where COS-specific logic
 * should appear. Route / service / domain layers never depend on this
 * implementation directly -- they only depend on ObjectStorageAdapter.
 *
 * Migration strategy:
 * - If COS credentials are configured, use the real COS SDK.
 * - If credentials are absent, keep the placeholder behavior for local/dev
 *   compatibility so existing callers are not broken by the migration.
 *
 * Configuration is now explicit-driven:
 * - Production: created via `CosProviderConfig` (from project binding).
 * - Test: created with `client` injection or `CosProviderConfig`.
 * - Legacy env-var mode is retained ONLY as a backward-compatible fallback
 *   for non-project-aware callers (not the formal long-term architecture).
 */

import COS from "cos-nodejs-sdk-v5";
import { sanitizeKeySegment } from "./scopes.js";
import type {
  ObjectStorageAdapter,
  UploadRequestInput,
  UploadRequestResult,
  DownloadRequestInput,
  DownloadRequestResult,
  HeadObjectInput,
  HeadObjectResult,
  DeleteObjectInput,
  DeleteObjectResult,
  NormalizeObjectKeyInput,
  NormalizeObjectKeyResult,
} from "./adapter.js";

interface CosLikeClient {
  getObjectUrl(options: Record<string, unknown>): string;
  headObject(
    options: Record<string, unknown>,
    callback: (error: unknown, data?: { headers?: Record<string, string> }) => void,
  ): void;
  deleteObject(
    options: Record<string, unknown>,
    callback: (error: unknown, data?: unknown) => void,
  ): void;
}

/** Explicit COS provider configuration (the preferred way to create this adapter). */
export interface CosProviderConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  signExpiresSeconds?: number;
  downloadDomain?: string;
}

export interface CosObjectStorageAdapterOptions {
  /** Injected COS client for testing. */
  client?: CosLikeClient;
  /** Explicit provider configuration (takes precedence over env vars). */
  config?: CosProviderConfig;
}

export class CosObjectStorageAdapter implements ObjectStorageAdapter {
  private readonly bucket: string;
  private readonly region: string;
  private readonly signExpiresSeconds: number;
  private readonly secretId?: string;
  private readonly secretKey?: string;
  private readonly downloadDomain?: string;
  private readonly injectedClient?: CosLikeClient;

  constructor(options?: CosObjectStorageAdapterOptions) {
    if (options?.config) {
      // Explicit configuration (project binding driven)
      this.bucket = options.config.bucket;
      this.region = options.config.region;
      this.secretId = options.config.secretId;
      this.secretKey = options.config.secretKey;
      this.signExpiresSeconds = options.config.signExpiresSeconds ?? 900;
      this.downloadDomain = this.normalizeDownloadDomain(options.config.downloadDomain);
    } else {
      // Legacy env-var fallback (not the formal long-term architecture)
      this.bucket = process.env.COS_BUCKET ?? "placeholder-bucket";
      this.region = process.env.COS_REGION ?? "ap-guangzhou";
      this.signExpiresSeconds = this.parseSignExpiresSeconds(process.env.COS_SIGN_EXPIRES_SECONDS);
      this.secretId = process.env.COS_SECRET_ID;
      this.secretKey = process.env.COS_SECRET_KEY;
      this.downloadDomain = this.normalizeDownloadDomain(process.env.COS_DOWNLOAD_DOMAIN);
    }
    this.injectedClient = options?.client;
  }

  async createUploadRequest(input: UploadRequestInput): Promise<UploadRequestResult> {
    const expiresAt = this.computeExpiresAt();

    if (!this.isConfigured()) {
      const uploadUrl = `https://${this.bucket}.cos.${this.region}.myqcloud.com/${input.objectKey}?sign=placeholder-sign&expires=${expiresAt}`;
      return {
        objectKey: input.objectKey,
        uploadUrl,
        requiredHeaders: {
          "Content-Type": input.contentType,
        },
        expiresAt,
      };
    }

    const client = this.getClient();
    const uploadUrl = client.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: input.objectKey,
      Sign: true,
      Expires: this.signExpiresSeconds,
      Method: "PUT",
      Headers: {
        "Content-Type": input.contentType,
      },
    });

    return {
      objectKey: input.objectKey,
      uploadUrl,
      requiredHeaders: {
        "Content-Type": input.contentType,
      },
      expiresAt,
    };
  }

  async createDownloadRequest(input: DownloadRequestInput): Promise<DownloadRequestResult> {
    const expiresAt = this.computeExpiresAt();

    if (!this.isConfigured()) {
      const downloadUrl = `https://${this.bucket}.cos.${this.region}.myqcloud.com/${input.objectKey}?sign=placeholder-download-sign&expires=${expiresAt}`;
      return {
        downloadUrl,
        expiresAt,
      };
    }

    const client = this.getClient();
    const downloadUrl = client.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: input.objectKey,
      Sign: true,
      Expires: this.signExpiresSeconds,
      Method: "GET",
      Domain: this.downloadDomain,
      ForceSignHost: this.downloadDomain ? false : undefined,
    });

    return {
      downloadUrl,
      expiresAt,
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    if (!this.isConfigured()) {
      return {
        exists: true,
        size: 0,
        contentType: "application/octet-stream",
        lastModified: new Date().toISOString(),
      };
    }

    const client = this.getClient();

    return new Promise<HeadObjectResult>((resolve, reject) => {
      client.headObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: input.objectKey,
        },
        (error, data) => {
          if (error) {
            if (this.isNotFoundError(error)) {
              resolve({ exists: false });
              return;
            }
            reject(error);
            return;
          }

          const headers = data?.headers ?? {};
          const sizeRaw = headers["content-length"];
          const lastModifiedRaw = headers["last-modified"];
          resolve({
            exists: true,
            size: sizeRaw ? Number(sizeRaw) : undefined,
            contentType: headers["content-type"],
            lastModified: lastModifiedRaw ? new Date(lastModifiedRaw).toISOString() : undefined,
          });
        },
      );
    });
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    if (!this.isConfigured()) {
      return { deleted: true };
    }

    const client = this.getClient();

    return new Promise<DeleteObjectResult>((resolve, reject) => {
      client.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: input.objectKey,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ deleted: true });
        },
      );
    });
  }

  normalizeObjectKey(input: NormalizeObjectKeyInput): NormalizeObjectKeyResult {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, "0");
    const uuid = crypto.randomUUID();
    const objectKey = `${sanitizeKeySegment(input.project)}/${sanitizeKeySegment(input.env)}/${sanitizeKeySegment(input.domain)}/${sanitizeKeySegment(input.scope)}/${sanitizeKeySegment(input.entityId)}/${sanitizeKeySegment(input.fileKind)}/${yyyy}/${mm}/${uuid}-${sanitizeKeySegment(input.fileName)}`;
    return { objectKey };
  }

  private isConfigured(): boolean {
    return Boolean(this.secretId && this.secretKey && this.bucket && this.region);
  }

  private getClient(): CosLikeClient {
    if (this.injectedClient) {
      return this.injectedClient;
    }

    if (!this.secretId || !this.secretKey) {
      throw new Error("COS credentials are not configured");
    }

    return new COS({
      SecretId: this.secretId,
      SecretKey: this.secretKey,
      Protocol: "https:",
      Timeout: 60000,
    }) as unknown as CosLikeClient;
  }

  private parseSignExpiresSeconds(raw: string | undefined): number {
    const value = Number(raw ?? "900");
    if (!Number.isFinite(value) || value <= 0) {
      return 900;
    }
    return Math.floor(value);
  }

  private normalizeDownloadDomain(raw: string | undefined): string | undefined {
    if (!raw) {
      return undefined;
    }

    const normalized = raw.trim().replace(/\/+$/, "");
    if (!normalized) {
      return undefined;
    }

    if (this.isSharedDeliveryHost(normalized)) {
      throw new Error("COS provider downloadDomain must not use shared delivery hosts");
    }

    return normalized;
  }

  private isSharedDeliveryHost(value: string): boolean {
    try {
      const url = new URL(value);
      return url.hostname === "dl-dev.infinex.cn" || url.hostname === "dl.infinex.cn";
    } catch {
      return value === "dl-dev.infinex.cn" || value === "dl.infinex.cn";
    }
  }

  private computeExpiresAt(): string {
    return new Date(Date.now() + this.signExpiresSeconds * 1000).toISOString();
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const candidate = error as { statusCode?: number; code?: string; error?: { Code?: string } };
    return candidate.statusCode === 404 || candidate.code === "NoSuchKey" || candidate.error?.Code === "NoSuchKey";
  }
}
