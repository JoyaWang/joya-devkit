/**
 * ObjectPolicyDerivation
 *
 * Derives default objectProfile and accessClass based on:
 * - domain (release, member, public, etc.)
 * - scope (artifact, avatar, media, etc.)
 * - fileKind, fileName, contentType
 *
 * Rules:
 * - release artifact -> release_artifact + public-stable
 * - member/avatar -> private_media + private-signed
 * - public media -> public_media + public-stable
 * - default -> private_document + private-signed
 */

export type ObjectProfile =
  | "release_artifact"
  | "public_asset"
  | "public_media"
  | "private_media"
  | "private_document"
  | "internal_archive";

export type AccessClass = "public-stable" | "private-signed" | "internal-signed";

export interface ObjectPolicy {
  objectProfile: ObjectProfile;
  accessClass: AccessClass;
}

export interface DerivePolicyInput {
  domain: string;
  scope: string;
  fileKind: string;
  fileName: string;
  contentType: string;
}

/**
 * Derive default object policy based on domain, scope, and file metadata.
 */
export function deriveDefaultPolicy(input: DerivePolicyInput): ObjectPolicy {
  const { domain, scope, fileKind, contentType } = input;

  // Release artifacts -> public-stable
  if (scope === "release" || domain === "release") {
    return {
      objectProfile: "release_artifact",
      accessClass: "public-stable",
    };
  }

  // Profile-only private content (avatar is public by design)
  if (scope === "profile") {
    return {
      objectProfile: "private_media",
      accessClass: "private-signed",
    };
  }

  // Feedback content (screenshots and logs) -> public-stable for issue integration
  if (scope === "feedback") {
    return {
      objectProfile: contentType.startsWith("image/") ? "public_media" : "public_asset",
      accessClass: "public-stable",
    };
  }

  // Public media (images, videos) -> public-stable
  if (
    domain === "public" ||
    scope === "media" ||
    contentType.startsWith("image/") ||
    contentType.startsWith("video/")
  ) {
    return {
      objectProfile: "public_media",
      accessClass: "public-stable",
    };
  }

  // Internal archive -> internal-signed
  if (domain === "internal" || scope === "archive" || scope === "log") {
    return {
      objectProfile: "internal_archive",
      accessClass: "internal-signed",
    };
  }

  // Default: private document
  return {
    objectProfile: "private_document",
    accessClass: "private-signed",
  };
}
