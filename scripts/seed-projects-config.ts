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

function readFirst(env: EnvMap, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value;
    }
  }
  return fallback;
}

export function resolveObjectStorageSeedConfig(
  input: ResolveObjectStorageSeedConfigInput,
): ObjectStorageSeedConfig {
  const envKey = upper(input.runtimeEnv);
  const projectKey = upper(input.projectKey);

  return {
    bucket: readFirst(
      input.env,
      [`SHARED_${envKey}_COS_BUCKET`, `${projectKey}_${envKey}_COS_BUCKET`, `${projectKey}_COS_BUCKET`],
      `${input.projectKey}-${input.runtimeEnv}-bucket-1250000000`,
    ),
    region: readFirst(
      input.env,
      [`SHARED_${envKey}_COS_REGION`, `${projectKey}_${envKey}_COS_REGION`, `${projectKey}_COS_REGION`],
      input.projectKey === "laicai" ? "ap-shanghai" : "ap-guangzhou",
    ),
    secretId: readFirst(
      input.env,
      [`SHARED_${envKey}_COS_SECRET_ID`, `${projectKey}_${envKey}_COS_SECRET_ID`, `${projectKey}_COS_SECRET_ID`],
      "placeholder-secret-id",
    ),
    secretKey: readFirst(
      input.env,
      [`SHARED_${envKey}_COS_SECRET_KEY`, `${projectKey}_${envKey}_COS_SECRET_KEY`, `${projectKey}_COS_SECRET_KEY`],
      "placeholder-secret-key",
    ),
    downloadDomain: readFirst(
      input.env,
      [
        `SHARED_${envKey}_COS_DOWNLOAD_DOMAIN`,
        `${projectKey}_${envKey}_COS_DOWNLOAD_DOMAIN`,
        `${projectKey}_COS_DOWNLOAD_DOMAIN`,
      ],
      "",
    ) || (input.runtimeEnv === "prd" ? undefined : "https://origin-dev.infinex.cn"),
  };
}
