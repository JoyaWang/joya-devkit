/**
 * Public API auth-bypass policy.
 *
 * Route-level `config.skipAuth` is the primary contract. The explicit path
 * allowlist is kept as a defensive fallback for public routes that must be
 * reachable by client apps without a project service token.
 */

const publicAuthPaths = new Set([
  "/v1/auth/send-code",
  "/v1/auth/register",
  "/v1/auth/login",
  "/v1/auth/reset-password",
  "/v1/auth/refresh",
  "/v1/auth/me", // uses internal user JWT verification
  "/v1/auth/account", // uses internal user JWT verification
  "/v1/auth/email/register",
  "/v1/auth/email/login",
  "/v1/feedback/client-settings",
  "/v1/feedback/submit-crash",
  "/v1/feedback/submit-errors",
  "/v1/feedback/submit-manual",
  "/v1/releases/latest",
  "/v1/releases/check",
]);

export function normalizeAuthPath(url: string): string {
  let path: string;
  try {
    path = new URL(url, "http://srs.local").pathname;
  } catch {
    path = url.split("?")[0] || url;
  }

  return path.startsWith("/api/") ? path.slice(4) : path;
}

export function hasRouteSkipAuth(request: { routeOptions?: { config?: unknown } }): boolean {
  const config = request.routeOptions?.config;
  if (!config || typeof config !== "object") return false;
  return (config as { skipAuth?: unknown }).skipAuth === true;
}

export function shouldSkipAuth(url: string, method: string): boolean {
  const path = normalizeAuthPath(url);
  if (path === "/health" && method === "GET") return true;
  if (publicAuthPaths.has(path)) return true;
  if (path.startsWith("/v1/legal/")) return true;
  if (path.startsWith("/v1/delivery/")) return true;
  return false;
}
