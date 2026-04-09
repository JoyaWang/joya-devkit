/**
 * Shared kernel for shared-runtime-services.
 *
 * Cross-cutting types, constants, and utilities used by all packages.
 */

// --- Result type for error handling without throwing ---

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// --- Common constants ---

export const SERVICE_NAME = 'shared-runtime-services' as const;

// --- Health check response ---

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
}
