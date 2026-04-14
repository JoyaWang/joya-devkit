import { describe, expect, it } from "vitest";
import { resolveObjectStorageSeedConfig } from "../scripts/seed-projects-config.js";

describe("resolveObjectStorageSeedConfig", () => {
  it("prefers shared env-scoped storage config for different projects in the same runtime", () => {
    const env = {
      SHARED_DEV_COS_BUCKET: "shared-dev-bucket-1321178972",
      SHARED_DEV_COS_REGION: "ap-shanghai",
      SHARED_DEV_COS_SECRET_ID: "shared-dev-id",
      SHARED_DEV_COS_SECRET_KEY: "shared-dev-key",
      SHARED_DEV_COS_DOWNLOAD_DOMAIN: "https://origin-dev.infinex.cn",
      INFOV_DEV_COS_BUCKET: "infov-dev-bucket-should-not-win",
      LAICAI_DEV_COS_BUCKET: "laicai-dev-bucket-should-not-win",
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

  it("defaults shared non-prod download domain to origin-dev when shared bucket config is present", () => {
    const config = resolveObjectStorageSeedConfig({
      projectKey: "laicai",
      runtimeEnv: "dev",
      env: {
        SHARED_DEV_COS_BUCKET: "shared-dev-bucket-1321178972",
        SHARED_DEV_COS_REGION: "ap-shanghai",
        SHARED_DEV_COS_SECRET_ID: "shared-dev-id",
        SHARED_DEV_COS_SECRET_KEY: "shared-dev-key",
      },
    });

    expect(config).toEqual({
      bucket: "shared-dev-bucket-1321178972",
      region: "ap-shanghai",
      secretId: "shared-dev-id",
      secretKey: "shared-dev-key",
      downloadDomain: "https://origin-dev.infinex.cn",
    });
  });

  it("falls back to project-scoped config when shared env-scoped storage config is absent", () => {
    const config = resolveObjectStorageSeedConfig({
      projectKey: "infov",
      runtimeEnv: "prd",
      env: {
        INFOV_PRD_COS_BUCKET: "infov-prd-bucket-1250000000",
        INFOV_PRD_COS_REGION: "ap-guangzhou",
        INFOV_PRD_COS_SECRET_ID: "infov-prd-id",
        INFOV_PRD_COS_SECRET_KEY: "infov-prd-key",
        INFOV_PRD_COS_DOWNLOAD_DOMAIN: "https://origin-prd.infov.example.com",
      },
    });

    expect(config).toEqual({
      bucket: "infov-prd-bucket-1250000000",
      region: "ap-guangzhou",
      secretId: "infov-prd-id",
      secretKey: "infov-prd-key",
      downloadDomain: "https://origin-prd.infov.example.com",
    });
  });
});
