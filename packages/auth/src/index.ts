/**
 * Auth package.
 *
 * Phase 1 — project service token validation via environment variable mapping.
 */

export interface AuthResult {
  valid: boolean;
  projectKey?: string;
  error?: string;
}

export interface TokenValidator {
  validate(token: string): Promise<AuthResult>;
}

/**
 * EnvTokenValidator — maps service tokens to project keys via environment variable.
 *
 * Environment variable format:
 *   SERVICE_TOKENS=token1=projectKey1,token2=projectKey2
 *
 * Example:
 *   SERVICE_TOKENS=dev-token-infov=infov,dev-token-laicai=laicai
 */
export class EnvTokenValidator implements TokenValidator {
  private readTokenMap(): Map<string, string> {
    const tokenMap = new Map<string, string>();
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
      const projectKey = pair.slice(eqIndex + 1).trim();
      if (token && projectKey) {
        tokenMap.set(token, projectKey);
      }
    }

    return tokenMap;
  }

  async validate(token: string): Promise<AuthResult> {
    if (!token) {
      return { valid: false, error: "missing token" };
    }

    const tokenMap = this.readTokenMap();
    const projectKey = tokenMap.get(token);
    if (!projectKey) {
      return { valid: false, error: "invalid token" };
    }
    return { valid: true, projectKey };
  }
}
