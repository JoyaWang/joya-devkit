/**
 * Contract tests for production deployment hardening.
 * These tests verify Docker build correctness, port configuration,
 * and .dockerignore setup.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");

/**
 * Read file content helper
 */
function readFileContent(relativePath: string): string {
  const fullPath = resolve(ROOT_DIR, relativePath);
  return readFileSync(fullPath, "utf-8");
}

function readRepoFileContent(relativePath: string): string {
  const fullPath = resolve(ROOT_DIR, "..", relativePath);
  return readFileSync(fullPath, "utf-8");
}

function lineIndex(content: string, needle: string): number {
  return content.split("\n").findIndex((line) => line.includes(needle));
}

/**
 * Parse Dockerfile into array of instructions
 */
function parseDockerfile(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Extract RUN instructions
 */
function extractRunInstructions(content: string): string[] {
  const instructions = parseDockerfile(content);
  return instructions
    .filter((line) => line.startsWith("RUN "))
    .map((line) => line.slice(4).trim());
}

describe("GitHub deploy workflows - secure Laicai service token rotation", () => {
  it("production workflow MUST rotate Laicai SERVICE_TOKENS from a temporary GitHub secret and persist it to Vault", () => {
    const workflow = readRepoFileContent(".github/workflows/deploy.yml");

    expect(workflow).toContain("rotate_laicai_service_token");
    expect(workflow).toContain("LAICAI_SRS_SERVICE_TOKEN_ROTATION");
    expect(workflow).toContain("scripts/rotate-laicai-service-token.py");
    expect(workflow).not.toContain("service_tokens_override");
    expect(workflow).not.toContain("SERVICE_TOKENS_OVERRIDE");
  });

  it("rotation script MUST target the laicai:prod mapping and Vault SERVICE_TOKENS secret without logging token values", () => {
    const script = readRepoFileContent("scripts/rotate-laicai-service-token.py");

    expect(script).toContain("laicai:prod");
    expect(script).toContain("https://vault.infinex.cn/api");
    expect(script).toContain("/v3/secrets/raw/{SERVICE_TOKENS_KEY}");
    expect(script).toContain("LAICAI_SRS_SERVICE_TOKEN_ROTATION");
    expect(script).toContain("new_token = require_env(ROTATION_ENV_KEY)");
    expect(script).not.toContain("print(new_token");
    expect(script).not.toContain("print(rotated_service_tokens");
  });
});

describe("GitHub deploy workflows - checkout before repository scripts", () => {
  for (const workflowPath of [".github/workflows/deploy.yml", ".github/workflows/deploy-dev.yml"]) {
    it(`${workflowPath} MUST checkout repository before calling scripts/gen-env-runtime.sh`, () => {
      const workflow = readRepoFileContent(workflowPath);
      const checkoutIndex = lineIndex(workflow, "uses: actions/checkout@v4");
      const genEnvIndex = lineIndex(workflow, "bash scripts/gen-env-runtime.sh");

      expect(checkoutIndex).toBeGreaterThanOrEqual(0);
      expect(genEnvIndex).toBeGreaterThanOrEqual(0);
      expect(checkoutIndex).toBeLessThan(genEnvIndex);
    });

    it(`${workflowPath} MUST retry remote git fetch before invoking deploy script`, () => {
      const workflow = readRepoFileContent(workflowPath);
      const fetchIndex = lineIndex(workflow, "git fetch origin");
      const deployScriptIndex = lineIndex(workflow, "bash srs/scripts/deploy-remote-ssh.sh");

      expect(workflow).toContain("retry_remote_git_update");
      expect(workflow).toContain("for attempt in 1 2 3 4 5");
      expect(fetchIndex).toBeGreaterThanOrEqual(0);
      expect(deployScriptIndex).toBeGreaterThanOrEqual(0);
      expect(fetchIndex).toBeLessThan(deployScriptIndex);
    });
  }
});

describe("deploy-remote-ssh.sh - remote git fetch resilience", () => {
  it("MUST retry git fetch/reset so transient GitHub TLS failures do not fail deploy immediately", () => {
    const script = readRepoFileContent("srs/scripts/deploy-remote-ssh.sh");

    expect(script).toContain("retry_git_update");
    expect(script).toContain("for attempt in 1 2 3 4 5");
    expect(script).toContain("git fetch origin \"$BRANCH\"");
    expect(script).toContain("git reset --hard \"origin/$BRANCH\"");
  });

  it("MUST allow GitHub Actions to skip the inner code pull after it already reset the remote checkout", () => {
    const script = readRepoFileContent("srs/scripts/deploy-remote-ssh.sh");
    const workflow = readRepoFileContent(".github/workflows/deploy.yml");

    expect(script).toContain("--skip-code-pull");
    expect(script).toContain("SKIP_CODE_PULL=\"true\"");
    expect(script).toContain("[OK] Code pull skipped by caller");
    expect(workflow).toContain("bash srs/scripts/deploy-remote-ssh.sh prod --skip-code-pull");
  });
});

describe("Dockerfile.api - workspace manifests", () => {
  const dockerfile = readFileContent("infra/Dockerfile.api");

  it("MUST copy apps/api/package.json before pnpm install", () => {
    // Find COPY instructions that come before pnpm install
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    expect(installLineIndex).toBeGreaterThan(-1);

    // Check that apps/api/package.json is copied before install
    let foundApiPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (lines[i].includes("COPY") && lines[i].includes("apps/api/package.json")) {
        foundApiPackage = true;
        break;
      }
    }
    expect(foundApiPackage).toBe(true);
  });

  it("MUST copy packages/auth/package.json (api dependency)", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundAuthPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (lines[i].includes("COPY") && lines[i].includes("packages/auth/package.json")) {
        foundAuthPackage = true;
        break;
      }
    }
    expect(foundAuthPackage).toBe(true);
  });

  it("MUST copy packages/object-service/package.json (api dependency)", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundObjectServicePackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/object-service/package.json")
      ) {
        foundObjectServicePackage = true;
        break;
      }
    }
    expect(foundObjectServicePackage).toBe(true);
  });

  it("MUST copy packages/project-context/package.json (api dependency)", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundProjectContextPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/project-context/package.json")
      ) {
        foundProjectContextPackage = true;
        break;
      }
    }
    expect(foundProjectContextPackage).toBe(true);
  });

  it("MUST copy packages/shared-kernel/package.json (api dependency)", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundSharedKernelPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/shared-kernel/package.json")
      ) {
        foundSharedKernelPackage = true;
        break;
      }
    }
    expect(foundSharedKernelPackage).toBe(true);
  });
});

describe("Dockerfile.api - prisma generate", () => {
  const dockerfile = readFileContent("infra/Dockerfile.api");

  it("MUST execute prisma generate (or equivalent) for clean build", () => {
    const runs = extractRunInstructions(dockerfile);
    const hasPrismaGenerate = runs.some(
      (run) =>
        run.includes("prisma generate") ||
        run.includes("db:generate") ||
        run.includes("pnpm db:generate")
    );
    expect(hasPrismaGenerate).toBe(true);
  });

  it("MUST provide DATABASE_URL when running prisma generate in clean Docker builds", () => {
    const runs = extractRunInstructions(dockerfile);
    const prismaGenerateRun = runs.find(
      (run) =>
        run.includes("prisma generate") ||
        run.includes("db:generate") ||
        run.includes("pnpm db:generate")
    );

    expect(prismaGenerateRun).toBeTruthy();
    expect(prismaGenerateRun).toContain("DATABASE_URL=");
  });
});

/**
 * Runner image must produce a dependency layout where `node dist/index.js`
 * can actually resolve all imports at runtime.  The root cause of the
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'fastify'` crash is that
 * pnpm installs direct deps under `apps/api/node_modules/` as symlinks,
 * but the runner stage only copies the root `/app/node_modules/` --
 * leaving `apps/api/node_modules/` entirely absent.
 *
 * The fix must ensure that, in the runner image, every package that
 * `apps/api` imports is resolvable from `/app/dist/index.js` via standard
 * Node.js module resolution (walking up to `/app/node_modules/`).
 *
 * Strategy: use `pnpm deploy --prod` in the builder to produce a
 * self-contained, symlink-free node_modules that can be COPYed directly
 * into the runner.
 */
describe("Dockerfile.api - runner resolves all runtime imports", () => {
  const dockerfile = readFileContent("infra/Dockerfile.api");

  /**
   * Helper: extract the runner stage content (after the last FROM for runner).
   */
  function getRunnerStage(): string {
    const idx = dockerfile.indexOf("AS runner");
    expect(idx).toBeGreaterThan(-1);
    return dockerfile.slice(idx);
  }

  it("MUST use pnpm deploy (or equivalent) to produce a flat, symlink-free node_modules for the runner", () => {
    const builderStage = dockerfile.slice(0, dockerfile.indexOf("AS runner"));
    // The builder must include a step that generates a production-only
    // node_modules without pnpm symlinks, e.g. `pnpm deploy --prod`
    const hasDeployStep = /pnpm\s+deploy|--prod.*install|npm\s+ci|npm\s+install\s+--production/.test(builderStage);
    expect(hasDeployStep).toBe(true);
  });

  it("MUST copy the production node_modules to runner WITHOUT copying .pnpm store", () => {
    const runner = getRunnerStage();
    // The runner should NOT copy /app/node_modules directly (which has .pnpm)
    // Instead it should copy a deploy target or explicitly exclude .pnpm
    const copyNodeModules = runner.match(/COPY\s+--from=builder\s+\S+\s+\.\/node_modules/);
    if (copyNodeModules) {
      // If copying node_modules, the source must be a deploy target, not the raw root node_modules
      // i.e. should NOT be "/app/node_modules" which contains .pnpm symlinks
      const sourceMatch = runner.match(/COPY\s+--from=builder\s+(\/\S+)\s+\.\/node_modules/);
      expect(sourceMatch).toBeTruthy();
      // The source should be a dedicated deploy directory, not the pnpm root
      expect(sourceMatch![1]).not.toBe("/app/node_modules");
    }
  });

  it("MUST make 'fastify' resolvable at runtime (not just present in .pnpm store)", () => {
    // This test verifies the Dockerfile structure ensures the fix;
    // the actual runtime proof is the docker build + run verification.
    // We check that either pnpm deploy is used OR the node_modules copy
    // comes from a flattened directory.
    const builderStage = dockerfile.slice(0, dockerfile.indexOf("AS runner"));
    const runnerStage = getRunnerStage();

    // Either: pnpm deploy produces flat node_modules, or
    // the runner explicitly copies from a deploy target
    const usesDeploy = builderStage.includes("pnpm deploy");
    const usesCustomCopy = runnerStage.includes("/app/api-prod/") ||
                           runnerStage.includes("/app/deploy/") ||
                           runnerStage.includes("/app/api-deploy/");

    expect(usesDeploy || usesCustomCopy).toBe(true);
  });

  it("MUST NOT rely on pnpm symlink structure for runtime resolution", () => {
    const runner = getRunnerStage();
    // Only check non-comment lines for pnpm/corepack instructions
    const codeLines = runner
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith("#"));
    const hasPnpmInstruction = codeLines.some(
      (l: string) => l.includes("corepack enable") || l.startsWith("RUN pnpm") || l.includes("pnpm install") || l.includes("pnpm deploy")
    );
    expect(hasPnpmInstruction).toBe(false);
  });
});

describe("Dockerfile.api - runner stage includes all runtime dependencies", () => {
  const dockerfile = readFileContent("infra/Dockerfile.api");

  // With pnpm deploy, all workspace packages (@srs/auth, etc.) are bundled
  // into the flat node_modules via api-prod/node_modules/@srs/*.  The runner
  // no longer needs separate COPY lines for packages/*/dist.
  it("MUST copy a flat node_modules from pnpm deploy target", () => {
    const runnerStageStart = dockerfile.indexOf("AS runner");
    expect(runnerStageStart).toBeGreaterThan(-1);
    const runnerStage = dockerfile.slice(runnerStageStart);
    // Must copy from the deploy target, not raw /app/node_modules
    expect(runnerStage).toContain("api-prod/node_modules");
  });

  it("MUST NOT separately copy packages/*/dist (handled by pnpm deploy)", () => {
    const runnerStageStart = dockerfile.indexOf("AS runner");
    const runnerStage = dockerfile.slice(runnerStageStart);
    // After pnpm deploy, workspace packages are inside node_modules/@srs/*
    // so separate COPY lines for packages/auth/dist etc. are unnecessary
    const hasSeparatePackageCopy = runnerStage.includes("packages/auth/dist") ||
      runnerStage.includes("packages/object-service/dist") ||
      runnerStage.includes("packages/project-context/dist") ||
      runnerStage.includes("packages/shared-kernel/dist");
    expect(hasSeparatePackageCopy).toBe(false);
  });

  it("MUST expose port 3010 (not 3000)", () => {
    const runnerStageStart = dockerfile.indexOf("AS runner");
    const runnerStage = dockerfile.slice(runnerStageStart);
    const exposeMatch = runnerStage.match(/EXPOSE\s+(\d+)/);
    expect(exposeMatch).toBeTruthy();
    expect(exposeMatch![1]).toBe("3010");
  });
});

describe("Dockerfile.worker - workspace manifests", () => {
  const dockerfile = readFileContent("infra/Dockerfile.worker");

  it("MUST copy apps/worker/package.json before pnpm install", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    expect(installLineIndex).toBeGreaterThan(-1);

    let foundWorkerPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (lines[i].includes("COPY") && lines[i].includes("apps/worker/package.json")) {
        foundWorkerPackage = true;
        break;
      }
    }
    expect(foundWorkerPackage).toBe(true);
  });

  it("MUST copy packages/shared-kernel/package.json (worker dependency)", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundSharedKernelPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/shared-kernel/package.json")
      ) {
        foundSharedKernelPackage = true;
        break;
      }
    }
    expect(foundSharedKernelPackage).toBe(true);
  });

  it("MUST copy packages/object-service/package.json when worker instantiates storage adapters", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundObjectServicePackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/object-service/package.json")
      ) {
        foundObjectServicePackage = true;
        break;
      }
    }
    expect(foundObjectServicePackage).toBe(true);
  });

  it("MUST copy packages/project-context/package.json because object-service depends on it", () => {
    const lines = dockerfile.split("\n");
    let installLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("pnpm install")) {
        installLineIndex = i;
        break;
      }
    }

    let foundProjectContextPackage = false;
    for (let i = 0; i < installLineIndex; i++) {
      if (
        lines[i].includes("COPY") &&
        lines[i].includes("packages/project-context/package.json")
      ) {
        foundProjectContextPackage = true;
        break;
      }
    }
    expect(foundProjectContextPackage).toBe(true);
  });
});

describe("docker-compose.yml - port configuration", () => {
  it("MUST expose api on port 3010 (not 3000)", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    // Simple check: look for the port mapping pattern
    expect(content).toMatch(/\s+ports:\s*\n\s+- "3010:3010"/);
  });

  it("MUST load root .env for api and worker services", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    const apiMatch = content.match(/api:[\s\S]*?(?=\n\s+worker:|$)/);
    const workerMatch = content.match(/worker:[\s\S]*?(?=\n\s+postgres:|$)/);

    expect(apiMatch).toBeTruthy();
    expect(workerMatch).toBeTruthy();
    expect(apiMatch![0]).toMatch(/^\s+env_file:\s*\n\s+-\s+\.\.\/\.env/m);
    expect(workerMatch![0]).toMatch(/^\s+env_file:\s*\n\s+-\s+\.\.\/\.env/m);
  });

  it("MUST reference runtime env vars instead of hardcoding api secrets", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    const apiMatch = content.match(/api:[\s\S]*?(?=\n\s+worker:|$)/);

    expect(apiMatch).toBeTruthy();
    expect(apiMatch![0]).toContain('DATABASE_URL: ${DATABASE_URL');
    expect(apiMatch![0]).toContain('REDIS_URL: ${REDIS_URL');
  });

  it("MUST NOT expose postgres port to host", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    // Find postgres section and check no ports
    const postgresMatch = content.match(/postgres:[\s\S]*?(?=\n\w|\n\s+volumes:|$)/);
    if (postgresMatch) {
      expect(postgresMatch[0]).not.toMatch(/^\s+ports:/m);
    }
  });

  it("MUST NOT expose redis port to host", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    // Find redis section and check no ports
    const redisMatch = content.match(/redis:[\s\S]*?(?=\n\w|\n\s+volumes:|$)/);
    if (redisMatch) {
      expect(redisMatch[0]).not.toMatch(/^\s+ports:/m);
    }
  });

  it("MUST set api PORT environment variable to 3010", () => {
    const composePath = resolve(ROOT_DIR, "infra/docker-compose.yml");
    const content = readFileSync(composePath, "utf-8");
    // Look for PORT: 3010 in api environment section
    const apiMatch = content.match(/api:[\s\S]*?(?=\n\s+worker:|$)/);
    if (apiMatch) {
      expect(apiMatch[0]).toMatch(/^\s+PORT:\s*3010/m);
    }
  });
});

describe(".dockerignore - exists and contains exclusions", () => {
  it("MUST have .dockerignore file in repository root", () => {
    const dockerignorePath = resolve(ROOT_DIR, ".dockerignore");
    expect(existsSync(dockerignorePath)).toBe(true);
  });

  it("MUST exclude node_modules", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toContain("node_modules");
  });

  it("MUST exclude .git", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toContain(".git");
  });

  it("MUST exclude dist directories", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toMatch(/dist/);
  });

  it("MUST exclude coverage directories", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toMatch(/coverage/);
  });

  it("MUST exclude test files", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toMatch(/tests/);
  });

  it("MUST exclude .env files (except .env.example)", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toMatch(/\.env$/m);
  });

  it("MUST exclude tmp/log directories", () => {
    const content = readFileContent(".dockerignore");
    expect(content).toMatch(/tmp|log/);
  });
});
