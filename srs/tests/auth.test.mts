/**
 * Unit tests for Auth token validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EnvTokenValidator } from "@srs/auth";

describe("EnvTokenValidator", () => {
  let validator: EnvTokenValidator;

  beforeEach(() => {
    // Set up environment for each test
    process.env.SERVICE_TOKENS = "test-token-1=project_a:dev,test-token-2=project_b:prd";
    validator = new EnvTokenValidator();
  });

  it("validates a known token and returns projectKey + runtimeEnv", async () => {
    const result = await validator.validate("test-token-1");
    expect(result.valid).toBe(true);
    expect(result.projectKey).toBe("project_a");
    expect(result.runtimeEnv).toBe("dev");
  });

  it("rejects an unknown token", async () => {
    const result = await validator.validate("unknown-token");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid");
  });

  it("rejects an empty token", async () => {
    const result = await validator.validate("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("missing");
  });

  it("rejects a token mapping without runtimeEnv", async () => {
    process.env.SERVICE_TOKENS = "legacy-token=project_only";
    validator = new EnvTokenValidator();

    const result = await validator.validate("legacy-token");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("runtimeEnv");
  });
});
