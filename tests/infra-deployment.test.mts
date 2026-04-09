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

describe("Dockerfile.api - runner stage includes all api dependencies", () => {
  const dockerfile = readFileContent("infra/Dockerfile.api");

  it("MUST include auth package dist in runner", () => {
    // Find the runner stage
    const runnerStageStart = dockerfile.indexOf("FROM node:20-alpine AS runner");
    expect(runnerStageStart).toBeGreaterThan(-1);

    const runnerStage = dockerfile.slice(runnerStageStart);
    expect(runnerStage).toContain("packages/auth");
  });

  it("MUST include object-service package dist in runner", () => {
    const runnerStageStart = dockerfile.indexOf("FROM node:20-alpine AS runner");
    const runnerStage = dockerfile.slice(runnerStageStart);
    expect(runnerStage).toContain("packages/object-service");
  });

  it("MUST include project-context package dist in runner", () => {
    const runnerStageStart = dockerfile.indexOf("FROM node:20-alpine AS runner");
    const runnerStage = dockerfile.slice(runnerStageStart);
    expect(runnerStage).toContain("packages/project-context");
  });

  it("MUST include shared-kernel package dist in runner", () => {
    const runnerStageStart = dockerfile.indexOf("FROM node:20-alpine AS runner");
    const runnerStage = dockerfile.slice(runnerStageStart);
    expect(runnerStage).toContain("packages/shared-kernel");
  });

  it("MUST expose port 3010 (not 3000)", () => {
    const runnerStageStart = dockerfile.indexOf("FROM node:20-alpine AS runner");
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
