/**
 * Auth package.
 *
 * Phase 1 — project service token validation via environment variable mapping.
 */

export interface AuthResult {
  valid: boolean;
  projectKey?: string;
  runtimeEnv?: string;
  error?: string;
}

export interface TokenValidator {
  validate(token: string): Promise<AuthResult>;
}

/**
 * EnvTokenValidator — maps service tokens to project key + runtime environment via environment variable.
 *
 * Environment variable format:
 *   SERVICE_TOKENS=token1=projectKey1:runtimeEnv1,token2=projectKey2:runtimeEnv2
 *
 * Example:
 *   SERVICE_TOKENS=dev-token-infov=infov:dev,prd-token-laicai=laicai:prod
 */
export class EnvTokenValidator implements TokenValidator {
  private readTokenMap(): Map<string, { projectKey: string; runtimeEnv: string }> {
    const tokenMap = new Map<string, { projectKey: string; runtimeEnv: string }>();
    const raw = process.env.SERVICE_TOKENS ?? "";
    if (!raw) {
      return tokenMap;
    }

    for (const pair of raw.split(",")) {
      const eqIndex = pair.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }

      const token = pair.slice(0, eqIndex).trim();
      const mapping = pair.slice(eqIndex + 1).trim();
      const separatorIndex = mapping.lastIndexOf(":");
      if (separatorIndex <= 0 || separatorIndex === mapping.length - 1) {
        continue;
      }

      const projectKey = mapping.slice(0, separatorIndex).trim();
      const runtimeEnv = mapping.slice(separatorIndex + 1).trim();
      if (token && projectKey && runtimeEnv) {
        tokenMap.set(token, { projectKey, runtimeEnv });
      }
    }

    return tokenMap;
  }

  async validate(token: string): Promise<AuthResult> {
    if (!token) {
      return { valid: false, error: "missing token" };
    }

    const tokenMap = this.readTokenMap();
    const resolved = tokenMap.get(token);
    if (!resolved) {
      const raw = process.env.SERVICE_TOKENS ?? "";
      const hasLegacyMapping = raw
        .split(",")
        .map((pair) => pair.trim())
        .some((pair) => pair.startsWith(`${token}=`));
      if (hasLegacyMapping) {
        return { valid: false, error: "invalid token mapping: runtimeEnv is required" };
      }
      return { valid: false, error: "invalid token" };
    }
    return { valid: true, projectKey: resolved.projectKey, runtimeEnv: resolved.runtimeEnv };
  }
}
