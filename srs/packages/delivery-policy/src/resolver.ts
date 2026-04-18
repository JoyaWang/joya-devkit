/**
 * DeliveryPolicyResolver
 *
 * Resolves delivery policy based on:
 * - env (dev/staging/prod)
 * - accessClass (public-stable/private-signed/internal-signed)
 * - objectKey / object metadata
 *
 * Public-stable objects get stable public URLs.
 * Private-signed / internal-signed objects only get signed URLs.
 */

export type AccessClass = "public-stable" | "private-signed" | "internal-signed";

export interface DeliveryPolicyResolverConfig {
  publicStableDomains: {
    dev: string;
    staging: string;
    prod: string;
    prd?: string; // alias for prod
  };
}

export interface ResolveInput {
  env: "dev" | "staging" | "prod" | "prd";
  accessClass: string;
  objectKey: string;
  objectProfile?: string;
}

export interface ResolveResult {
  type: "public_url" | "signed_url_only";
  url?: string;
  error?: string;
}

export class DeliveryPolicyResolver {
  private readonly config: DeliveryPolicyResolverConfig;

  constructor(config: DeliveryPolicyResolverConfig) {
    this.config = config;
  }

  resolve(input: ResolveInput): ResolveResult {
    const { env, accessClass, objectKey } = input;

    // Only public-stable objects can get public URLs
    if (accessClass !== "public-stable") {
      return {
        type: "signed_url_only",
        error: "access_class_not_public_stable",
      };
    }

    // Resolve domain based on env (prd is alias for prod)
    const normalizedEnv = env === "prd" ? "prod" : env;
    const domain = this.config.publicStableDomains[normalizedEnv] ?? this.config.publicStableDomains[env];
    if (!domain) {
      return {
        type: "signed_url_only",
        error: "unknown_env",
      };
    }

    // Generate public URL
    return {
      type: "public_url",
      url: `${domain}/${objectKey}`,
    };
  }
}
