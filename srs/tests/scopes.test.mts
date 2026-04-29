/**
 * Unit tests for Object Service scope validation and objectKey rules.
 */

import { describe, it, expect } from "vitest";
import { validateScope, validateObjectKeyFormat, sanitizeKeySegment } from "@srs/object-service";

describe("validateScope", () => {
  it("accepts valid scope+domain combinations", () => {
    expect(validateScope("avatar", "member")).toEqual({ valid: true });
    expect(validateScope("backup", "device")).toEqual({ valid: true });
    expect(validateScope("release", "android")).toEqual({ valid: true });
    expect(validateScope("release", "ios")).toEqual({ valid: true });
    expect(validateScope("release", "desktop")).toEqual({ valid: true });
    expect(validateScope("attachment", "message")).toEqual({ valid: true });
    expect(validateScope("log", "system")).toEqual({ valid: true });
    expect(validateScope("sdk-cache", "android-sdk")).toEqual({ valid: true });
    expect(validateScope("sdk-cache", "ios-vendors")).toEqual({ valid: true });
  });

  it("rejects unknown scope", () => {
    const result = validateScope("evil", "member");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not a recognized scope");
  });

  it("rejects valid scope with wrong domain", () => {
    const result = validateScope("avatar", "device");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid domain");
  });

  it("rejects empty scope", () => {
    const result = validateScope("", "member");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });
});

describe("validateObjectKeyFormat", () => {
  it("accepts a well-formed objectKey", () => {
    const result = validateObjectKeyFormat(
      "infov/prod/member/avatar/user_123/profile/2026/04/uuid-head.png"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects objectKey with too few segments", () => {
    const result = validateObjectKeyFormat("infov/prod/member");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 9 path segments");
  });

  it("rejects objectKey with invalid year", () => {
    const result = validateObjectKeyFormat(
      "infov/prod/member/avatar/user_123/profile/26a/04/uuid-head.png"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("4 digits");
  });

  it("rejects objectKey with invalid month", () => {
    const result = validateObjectKeyFormat(
      "infov/prod/member/avatar/user_123/profile/2026/4/uuid-head.png"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("2 digits");
  });
});

describe("sanitizeKeySegment", () => {
  it("replaces + with dash (version numbers)", () => {
    expect(sanitizeKeySegment("1.0.2+7")).toBe("1.0.2_7");
  });

  it("replaces spaces with dash", () => {
    expect(sanitizeKeySegment("my file name")).toBe("my_file_name");
  });

  it("leaves safe characters untouched", () => {
    expect(sanitizeKeySegment("android")).toBe("android");
    expect(sanitizeKeySegment("release-1.0.2")).toBe("release-1.0.2");
  });

  it("replaces multiple unsafe characters", () => {
    expect(sanitizeKeySegment("a+b#c")).toBe("a_b_c");
  });
});
