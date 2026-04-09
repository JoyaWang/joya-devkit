/**
 * ObjectStorageAdapter — provider-neutral contract.
 *
 * All route / service / domain layers depend only on this interface.
 * Provider SDK calls are confined to concrete adapter implementations.
 */

// --- Input / Output types ---

export interface UploadRequestInput {
  objectKey: string;
  contentType: string;
  size: number;
  checksum?: string;
}

export interface UploadRequestResult {
  objectKey: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
  expiresAt: string;
}

export interface DownloadRequestInput {
  objectKey: string;
}

export interface DownloadRequestResult {
  downloadUrl: string;
  expiresAt: string;
}

export interface HeadObjectInput {
  objectKey: string;
}

export interface HeadObjectResult {
  exists: boolean;
  size?: number;
  contentType?: string;
  lastModified?: string;
}

export interface DeleteObjectInput {
  objectKey: string;
}

export interface DeleteObjectResult {
  deleted: boolean;
}

export interface NormalizeObjectKeyInput {
  project: string;
  env: string;
  domain: string;
  scope: string;
  entityId: string;
  fileKind: string;
  fileName: string;
}

export interface NormalizeObjectKeyResult {
  objectKey: string;
}

// --- Adapter interface ---

export interface ObjectStorageAdapter {
  createUploadRequest(input: UploadRequestInput): Promise<UploadRequestResult>;
  createDownloadRequest(input: DownloadRequestInput): Promise<DownloadRequestResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult>;
  normalizeObjectKey(input: NormalizeObjectKeyInput): NormalizeObjectKeyResult;
}
