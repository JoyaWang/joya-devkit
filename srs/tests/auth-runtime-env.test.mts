/**
 * Tests for auth runtime env loading behavior.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { EnvTokenValidator } from "../packages/auth/src/index.js";

beforeEach(() => {
  delete process.env.SERVICE_TOKENS;
});

describe("EnvTokenValidator runtime env behavior", () => {
  it("reads SERVICE_TOKENS at validate-time so late-loaded env is honored", async () => {
    const validator = new EnvTokenValidator();
    process.env.SERVICE_TOKENS = "dev-token-infov=infov:dev,prd-token-laicai=laicai:prod";

    const result = await validator.validate("dev-token-infov");

    expect(result).toEqual({ valid: true, projectKey: "infov", runtimeEnv: "dev" });
  });

  it("normalizes legacy prd runtime mappings to prod", async () => {
    const validator = new EnvTokenValidator();
    process.env.SERVICE_TOKENS = "prd-token-laicai=laicai:prd";

    const result = await validator.validate("prd-token-laicai");

    expect(result).toEqual({ valid: true, projectKey: "laicai", runtimeEnv: "prod" });
  });
});
