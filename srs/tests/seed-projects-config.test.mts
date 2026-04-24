import { describe, expect, it } from "vitest";
import { resolveObjectStorageSeedConfig } from "../scripts/seed-projects-config.js";

describe("resolveObjectStorageSeedConfig", () => {
  it("uses the SHARED_COS canonical config for every project in one runtime environment", () => {
    const env = {
      SHARED_COS_BUCKET: "shared-dev-bucket-1321178972",
      SHARED_COS_REGION: "ap-shanghai",
      SHARED_COS_SECRET_ID: "shared-dev-id",
      SHARED_COS_SECRET_KEY: "shared-dev-key",
      SHARED_COS_DOWNLOAD_DOMAIN: "https://origin-dev.infinex.cn",
    };

    const infovDev = resolveObjectStorageSeedConfig({
      projectKey: "infov",
      runtimeEnv: "dev",
      env,
    });
    const laicaiDev = resolveObjectStorageSeedConfig({
      projectKey: "laicai",
      runtimeEnv: "dev",
      env,
    });

    expect(infovDev).toEqual({
      bucket: "shared-dev-bucket-1321178972",
      region: "ap-shanghai",
      secretId: "shared-dev-id",
      secretKey: "shared-dev-key",
      downloadDomain: "https://origin-dev.infinex.cn",
    });
    expect(laicaiDev).toEqual(infovDev);
  });

  it("does not read legacy env-scoped or project-scoped COS keys", () => {
    expect(() =>
      resolveObjectStorageSeedConfig({
        projectKey: "infov",
        runtimeEnv: "prod",
        env: {
          SHARED_PRD_COS_BUCKET: "legacy-shared-prd-bucket",
          SHARED_PRD_COS_REGION: "ap-guangzhou",
          SHARED_PRD_COS_SECRET_ID: "legacy-shared-prd-id",
          SHARED_PRD_COS_SECRET_KEY: "legacy-shared-prd-key",
          SHARED_PRD_COS_DOWNLOAD_DOMAIN: "https://legacy-origin.infinex.cn",
          INFOV_COS_BUCKET: "infov-bucket",
          INFOV_COS_REGION: "ap-guangzhou",
          INFOV_COS_SECRET_ID: "infov-id",
          INFOV_COS_SECRET_KEY: "infov-key",
          COS_BUCKET: "global-bucket",
          COS_REGION: "ap-guangzhou",
          COS_SECRET_ID: "global-id",
          COS_SECRET_KEY: "global-key",
        },
      }),
    ).toThrow("Missing required env var: SHARED_COS_BUCKET");
  });

  it("gets dev and prod differences from different Infisical env objects, not from key names", () => {
    const devConfig = resolveObjectStorageSeedConfig({
      projectKey: "laicai",
      runtimeEnv: "dev",
      env: {
        SHARED_COS_BUCKET: "shared-storage-dev-1321178972",
        SHARED_COS_REGION: "ap-shanghai",
        SHARED_COS_SECRET_ID: "dev-id",
        SHARED_COS_SECRET_KEY: "dev-key",
        SHARED_COS_DOWNLOAD_DOMAIN: "https://origin-dev.infinex.cn",
      },
    });

    const prodConfig = resolveObjectStorageSeedConfig({
      projectKey: "laicai",
      runtimeEnv: "prod",
      env: {
        SHARED_COS_BUCKET: "shared-storage-1321178972",
        SHARED_COS_REGION: "ap-shanghai",
        SHARED_COS_SECRET_ID: "prod-id",
        SHARED_COS_SECRET_KEY: "prod-key",
        SHARED_COS_DOWNLOAD_DOMAIN: "https://origin.infinex.cn",
      },
    });

    expect(devConfig.bucket).toBe("shared-storage-dev-1321178972");
    expect(devConfig.downloadDomain).toBe("https://origin-dev.infinex.cn");
    expect(prodConfig.bucket).toBe("shared-storage-1321178972");
    expect(prodConfig.downloadDomain).toBe("https://origin.infinex.cn");
  });
});
