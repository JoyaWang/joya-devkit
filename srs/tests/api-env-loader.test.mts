/**
 * Tests for API environment loading from the project root.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

let loadProjectEnv: typeof import("../apps/api/src/env.js").loadProjectEnv;

beforeAll(async () => {
  ({ loadProjectEnv } = await import("../apps/api/src/env.js"));
});

const createdDirs: string[] = [];

afterEach(() => {
  delete process.env.SERVICE_TOKENS;
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadProjectEnv", () => {
  it("loads the repo-root .env when the API runs from apps/api", () => {
    // Ensure a clean slate: external env vars must not leak into this test.
    // dotenv.config({ override: false }) won't overwrite existing values,
    // so any pre-existing SERVICE_TOKENS would cause a false assertion.
    delete process.env.SERVICE_TOKENS;

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "srs-env-loader-"));
    createdDirs.push(repoRoot);

    const apiDir = path.join(repoRoot, "apps", "api");
    const srcDir = path.join(apiDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, ".env"),
      "SERVICE_TOKENS=dev-token-infov=infov:dev,prd-token-laicai=laicai:prd\n",
      "utf8",
    );

    const loaded = loadProjectEnv({
      cwd: apiDir,
      moduleUrl: pathToFileURL(path.join(srcDir, "env.ts")).href,
      maxDepth: 4,
    });

    expect(loaded).toContain(path.join(repoRoot, ".env"));
    expect(process.env.SERVICE_TOKENS).toBe("dev-token-infov=infov:dev,prd-token-laicai=laicai:prd");
  });
});
