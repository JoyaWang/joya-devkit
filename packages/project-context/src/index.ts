/**
 * Project Context package.
 *
 * Provides types, errors, and resolver for the project protocol layer.
 */
export type {
  ProjectStatus,
  ServiceType,
  ObjectStorageProvider,
  ProjectManifest,
  ProjectServiceBinding,
  CosProviderConfig,
  MinioProviderConfig,
  ProviderConfig,
  ResolvedProjectContext,
} from "./types.js";

export {
  ProjectContextError,
  projectNotRegistered,
  projectInactive,
  serviceBindingMissing,
} from "./errors.js";

export type { ProjectContextErrorCode } from "./errors.js";

export {
  ProjectContextResolver,
} from "./resolver.js";

export type {
  ProjectDatabaseClient,
  ProjectManifestRow,
  ProjectServiceBindingRow,
} from "./resolver.js";
