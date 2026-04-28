import { describe, expect, it } from "vitest";

import { hasRouteSkipAuth, normalizeAuthPath, shouldSkipAuth } from "../apps/api/src/public-auth.js";

describe("public API auth-bypass policy", () => {
  it("normalizes query strings and reverse-proxy /api prefixes before allowlist matching", () => {
    expect(
      normalizeAuthPath(
        "/v1/releases/check?env=prod&platform=ios&currentVersion=1.0.0%2B1",
      ),
    ).toBe("/v1/releases/check");
    expect(
      normalizeAuthPath(
        "/api/v1/releases/check?env=prod&platform=ios&currentVersion=1.0.0%2B1",
      ),
    ).toBe("/v1/releases/check");
  });

  it("lets release check and latest endpoints bypass service-token auth without Authorization", () => {
    expect(
      shouldSkipAuth(
        "/v1/releases/check?env=prod&platform=ios&currentVersion=1.0.0%2B1&channel=official&deviceId=device-1",
        "GET",
      ),
    ).toBe(true);
    expect(
      shouldSkipAuth(
        "/api/v1/releases/latest?env=prod&platform=ios&channel=official",
        "GET",
      ),
    ).toBe(true);
  });

  it("lets feedback public intake endpoints bypass service-token auth", () => {
    expect(shouldSkipAuth("/v1/feedback/client-settings?projectKey=infov", "GET")).toBe(true);
    expect(shouldSkipAuth("/v1/feedback/submit-manual", "POST")).toBe(true);
    expect(shouldSkipAuth("/v1/feedback/submit-errors", "POST")).toBe(true);
    expect(shouldSkipAuth("/v1/feedback/submit-crash", "POST")).toBe(true);
  });

  it("honors route-level config.skipAuth as primary public route contract", () => {
    expect(hasRouteSkipAuth({ routeOptions: { config: { skipAuth: true } } })).toBe(true);
    expect(hasRouteSkipAuth({ routeOptions: { config: { skipAuth: false } } })).toBe(false);
    expect(hasRouteSkipAuth({ routeOptions: {} })).toBe(false);
  });

  it("keeps protected API routes behind service-token auth", () => {
    expect(shouldSkipAuth("/v1/objects/upload-requests", "POST")).toBe(false);
    expect(shouldSkipAuth("/api/v1/audit-logs?projectKey=infov", "GET")).toBe(false);
  });
});
