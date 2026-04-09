/**
 * MinioObjectStorageAdapter — MinIO placeholder implementation for local development.
 *
 * Phase 1 skeleton: methods throw "not implemented" to keep compile-safe.
 * Real MinIO SDK integration will be wired when local dev environment is set up.
 */

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
} from './adapter.js';

export class MinioObjectStorageAdapter implements ObjectStorageAdapter {
  async createUploadRequest(input: UploadRequestInput): Promise<UploadRequestResult> {
    throw new Error(`MinioObjectStorageAdapter.createUploadRequest not implemented. objectKey=${input.objectKey}`);
  }

  async createDownloadRequest(input: DownloadRequestInput): Promise<DownloadRequestResult> {
    throw new Error(`MinioObjectStorageAdapter.createDownloadRequest not implemented. objectKey=${input.objectKey}`);
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    throw new Error(`MinioObjectStorageAdapter.headObject not implemented. objectKey=${input.objectKey}`);
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    throw new Error(`MinioObjectStorageAdapter.deleteObject not implemented. objectKey=${input.objectKey}`);
  }

  normalizeObjectKey(input: NormalizeObjectKeyInput): NormalizeObjectKeyResult {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const uuid = crypto.randomUUID();
    const objectKey = `${input.project}/${input.env}/${input.domain}/${input.scope}/${input.entityId}/${input.fileKind}/${yyyy}/${mm}/${uuid}-${input.fileName}`;
    return { objectKey };
  }
}
