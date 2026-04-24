/**
 * Startup consistency check for project manifests and bindings.
 *
 * Verifies that every ProjectServiceBinding has a corresponding ProjectManifest.
 * Logs warnings if inconsistencies are found, but does NOT block startup.
 */

import type { PrismaClient } from "./generated/prisma/client.js";

export interface ConsistencyCheckResult {
  ok: boolean;
  missingManifests: string[];
  inactiveManifests: string[];
  totalBindings: number;
  totalManifests: number;
}

/**
 * Check that all bindings have corresponding active manifests.
 *
 * This is a startup sanity check to catch configuration drift early.
 * It logs warnings but does NOT throw — the system should still start
 * and serve requests for properly configured projects.
 */
export async function checkProjectConsistency(
  prisma: PrismaClient
): Promise<ConsistencyCheckResult> {
  const [bindings, manifests] = await Promise.all([
    prisma.projectServiceBinding.findMany({
      select: { projectKey: true, runtimeEnv: true, serviceType: true },
    }),
    prisma.projectManifest.findMany({
      select: { projectKey: true, status: true },
    }),
  ]);

  const manifestMap = new Map<string, string>(
    manifests.map((m: { projectKey: string; status: string }) => [m.projectKey, m.status])
  );

  const missingManifests: string[] = [];
  const inactiveManifests: string[] = [];

  for (const binding of bindings) {
    const status = manifestMap.get(binding.projectKey);

    if (!status) {
      missingManifests.push(
        `${binding.projectKey}/${binding.runtimeEnv}/${binding.serviceType}`
      );
    } else if (status !== "active") {
      inactiveManifests.push(
        `${binding.projectKey}/${binding.runtimeEnv}/${binding.serviceType} (status: ${status})`
      );
    }
  }

  const ok = missingManifests.length === 0 && inactiveManifests.length === 0;

  return {
    ok,
    missingManifests,
    inactiveManifests,
    totalBindings: bindings.length,
    totalManifests: manifests.length,
  };
}

/**
 * Log consistency check results in a human-readable format.
 */
export function logConsistencyResult(result: ConsistencyCheckResult): void {
  if (result.ok) {
    console.log(
      `✅ Project consistency check passed: ${result.totalManifests} manifests, ${result.totalBindings} bindings`
    );
    return;
  }

  console.warn("⚠️  Project consistency check found issues:");

  if (result.missingManifests.length > 0) {
    console.warn(
      `   ❌ Missing manifests for ${result.missingManifests.length} binding(s):`
    );
    for (const item of result.missingManifests) {
      console.warn(`      - ${item}`);
    }
  }

  if (result.inactiveManifests.length > 0) {
    console.warn(
      `   ⚠️  Inactive manifests for ${result.inactiveManifests.length} binding(s):`
    );
    for (const item of result.inactiveManifests) {
      console.warn(`      - ${item}`);
    }
  }

  console.warn(
    `   Tip: Run 'node dist-seed/scripts/seed-projects.js' in the API runtime container to create missing manifests and bindings`
  );
}
