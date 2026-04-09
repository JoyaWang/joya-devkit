/**
 * Unit tests for Auth token validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EnvTokenValidator } from "@srs/auth";

describe("EnvTokenValidator", () => {
  let validator: EnvTokenValidator;

  beforeEach(() => {
    // Set up environment for each test
    process.env.SERVICE_TOKENS = "test-token-1=project_a,test-token-2=project_b";
    validator = new EnvTokenValidator();
  });

  it("validates a known token", async () => {
    const result = await validator.validate("test-token-1");
    expect(result.valid).toBe(true);
    expect(result.projectKey).toBe("project_a");
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
});
