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

function upper(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function requireEnv(env: EnvMap, keys: string[]): string {
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value;
    }
  }
  throw new Error(`Missing required env var: one of ${keys.join(", ")}`);
}

export function resolveObjectStorageSeedConfig(
  input: ResolveObjectStorageSeedConfigInput,
): ObjectStorageSeedConfig {
  const envKey = upper(input.runtimeEnv);
  const projectKey = upper(input.projectKey);

  return {
    bucket: requireEnv(
      input.env,
      [`SHARED_${envKey}_COS_BUCKET`, `${projectKey}_${envKey}_COS_BUCKET`, `${projectKey}_COS_BUCKET`],
    ),
    region: requireEnv(
      input.env,
      [`SHARED_${envKey}_COS_REGION`, `${projectKey}_${envKey}_COS_REGION`, `${projectKey}_COS_REGION`],
    ),
    secretId: requireEnv(
      input.env,
      [`SHARED_${envKey}_COS_SECRET_ID`, `${projectKey}_${envKey}_COS_SECRET_ID`, `${projectKey}_COS_SECRET_ID`],
    ),
    secretKey: requireEnv(
      input.env,
      [`SHARED_${envKey}_COS_SECRET_KEY`, `${projectKey}_${envKey}_COS_SECRET_KEY`, `${projectKey}_COS_SECRET_KEY`],
    ),
    downloadDomain: requireEnv(
      input.env,
      [
        `SHARED_${envKey}_COS_DOWNLOAD_DOMAIN`,
        `${projectKey}_${envKey}_COS_DOWNLOAD_DOMAIN`,
        `${projectKey}_COS_DOWNLOAD_DOMAIN`,
      ],
    ),
  };
}
