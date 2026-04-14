/**
 * Scope validation and objectKey rules.
 *
 * Scope determines the semantic category of an object.
 * Each scope has allowed domains and file kinds.
 */

// Phase 1 allowed scopes with their permitted domains
const ALLOWED_SCOPES: Record<string, string[]> = {
  avatar: ["member"],
  backup: ["device"],
  release: ["android", "ios", "desktop"],
  attachment: ["message", "post"],
  log: ["system", "audit"],
};

export interface ScopeValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Sanitize a single objectKey path segment so it is URL-safe for
 * COS / S3 signing.  Characters that would require percent-encoding
 * (and therefore break signature round-trips) are replaced with `-`.
 *
 * We deliberately keep the set small and targeted — only characters
 * known to cause signature mismatches — so that segments remain
 * human-readable.
 */
const UNSAFE_SEGMENT_RE = /[+/\\?#{}\[\]<>|^~`"\s]/g;

export function sanitizeKeySegment(segment: string): string {
  return segment.replace(UNSAFE_SEGMENT_RE, "_");
}

/**
 * Validate a scope against the allowed scope registry.
 * Checks that scope is known and domain is permitted within that scope.
 */
export function validateScope(scope: string, domain: string): ScopeValidationResult {
  if (!scope) {
    return { valid: false, error: "scope is required" };
  }
  const allowedDomains = ALLOWED_SCOPES[scope];
  if (!allowedDomains) {
    return { valid: false, error: `invalid scope: "${scope}" is not a recognized scope` };
  }
  if (!allowedDomains.includes(domain)) {
    return {
      valid: false,
      error: `invalid domain "${domain}" for scope "${scope}". Allowed: ${allowedDomains.join(", ")}`,
    };
  }
  return { valid: true };
}

/**
 * Validate objectKey format.
 * Expected: {project}/{env}/{domain}/{scope}/{entityId}/{fileKind}/{yyyy}/{mm}/{uuid}-{filename}
 */
export function validateObjectKeyFormat(objectKey: string): ScopeValidationResult {
  const parts = objectKey.split("/");
  if (parts.length < 9) {
    return { valid: false, error: `objectKey format invalid: expected at least 9 path segments, got ${parts.length}` };
  }
  const [project, env, domain, scope, entityId, fileKind, year, month] = parts;
  if (!project || !env || !domain || !scope || !entityId || !fileKind) {
    return { valid: false, error: "objectKey contains empty segments" };
  }
  if (!/^\d{4}$/.test(year)) {
    return { valid: false, error: `objectKey year segment must be 4 digits, got "${year}"` };
  }
  if (!/^\d{2}$/.test(month)) {
    return { valid: false, error: `objectKey month segment must be 2 digits, got "${month}"` };
  }
  return { valid: true };
}
