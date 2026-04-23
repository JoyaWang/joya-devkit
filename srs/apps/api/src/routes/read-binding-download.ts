import type {
  DownloadRequestResult,
  ObjectStorageAdapterFactory,
} from "@srs/object-service";
import type { ProjectServiceBinding } from "@srs/project-context";

interface ResolveReadableDownloadInput {
  objectKey: string;
  candidateBindings: ProjectServiceBinding[];
  factory: ObjectStorageAdapterFactory;
}

export async function resolveReadableDownloadFromBindings(
  input: ResolveReadableDownloadInput,
): Promise<DownloadRequestResult | null> {
  for (const binding of input.candidateBindings) {
    console.log(`[DEBUG] Trying binding: ${binding.id}, config:`, JSON.stringify(binding.config));
    const adapter = input.factory.getOrCreate(binding);
    const headResult = await adapter.headObject({ objectKey: input.objectKey });
    console.log(`[DEBUG] headObject result for ${binding.id}:`, JSON.stringify(headResult));

    if (!headResult.exists) {
      continue;
    }

    return adapter.createDownloadRequest({ objectKey: input.objectKey });
  }

  return null;
}
