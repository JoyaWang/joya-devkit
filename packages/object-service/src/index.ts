/**
 * Object Service package.
 *
 * Exports the ObjectStorageAdapter contract, available implementations,
 * scope/objectKey validation rules, and the adapter factory.
 */
export type {
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
} from './adapter.js';

export { CosObjectStorageAdapter } from './cos-adapter.js';
export type { CosProviderConfig, CosObjectStorageAdapterOptions } from './cos-adapter.js';
export { MinioObjectStorageAdapter } from './minio-adapter.js';
export { ObjectStorageAdapterFactory } from './adapter-factory.js';
export { validateScope, validateObjectKeyFormat, sanitizeKeySegment } from './scopes.js';
export type { ScopeValidationResult } from './scopes.js';
