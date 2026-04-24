type EnvMap = Record<string, string | undefined>;

interface ResolveObjectStorageSeedConfigInput {
  projectKey: string;
  runtimeEnv: string;
  env: EnvMap;
}

interface ObjectStorageSeedConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  downloadDomain?: string;
}

function requireEnv(env: EnvMap, key: string): string {
  const value = env[key];
  if (value && value.trim()) {
    return value;
  }
  throw new Error(`Missing required env var: ${key}`);
}

export function resolveObjectStorageSeedConfig(
  input: ResolveObjectStorageSeedConfigInput,
): ObjectStorageSeedConfig {
  return {
    bucket: requireEnv(input.env, "SHARED_COS_BUCKET"),
    region: requireEnv(input.env, "SHARED_COS_REGION"),
    secretId: requireEnv(input.env, "SHARED_COS_SECRET_ID"),
    secretKey: requireEnv(input.env, "SHARED_COS_SECRET_KEY"),
    downloadDomain: requireEnv(input.env, "SHARED_COS_DOWNLOAD_DOMAIN"),
  };
}
