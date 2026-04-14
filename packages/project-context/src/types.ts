/**
 * Project context types.
 *
 * Defines the data structures for project manifest, service binding,
 * and provider-specific configuration.
 */

/** Project registration status. */
export type ProjectStatus = "active" | "inactive" | "suspended";

/** Supported service types that can be bound to a project. */
export type ServiceType = "object_storage" | (string & {});

/** Supported object storage provider identifiers. */
export type ObjectStorageProvider = "cos" | "minio" | (string & {});

/** Provider-neutral representation of a project manifest. */
export interface ProjectManifest {
  projectKey: string;
  displayName: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Provider-neutral representation of a project-service binding. */
export interface ProjectServiceBinding {
  id: string;
  projectKey: string;
  runtimeEnv: string;
  serviceType: ServiceType;
  provider: string;
  config: string; // JSON-encoded provider config
  createdAt: Date;
  updatedAt: Date;
}

/** COS-specific provider config (stored as JSON in binding.config). */
export interface CosProviderConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  signExpiresSeconds?: number;
  downloadDomain?: string;
}

/** Minio-specific provider config (stored as JSON in binding.config). */
export interface MinioProviderConfig {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

/** Union of all known provider config shapes. */
export type ProviderConfig = CosProviderConfig | MinioProviderConfig | Record<string, unknown>;

/** Resolved context for a project + service type pair. */
export interface ResolvedProjectContext {
  manifest: ProjectManifest;
  binding: ProjectServiceBinding;
}
