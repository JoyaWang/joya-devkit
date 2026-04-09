import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

interface LoadProjectEnvOptions {
  cwd?: string;
  moduleUrl?: string;
  maxDepth?: number;
}

export function loadProjectEnv(options: LoadProjectEnvOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const maxDepth = options.maxDepth ?? 5;
  const visited = new Set<string>();
  const loaded: string[] = [];

  const searchRoots = [cwd];
  if (options.moduleUrl) {
    searchRoots.push(path.dirname(fileURLToPath(options.moduleUrl)));
  }

  for (const root of searchRoots) {
    let current = path.resolve(root);
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const envPath = path.join(current, ".env");
      if (!visited.has(envPath)) {
        visited.add(envPath);
        if (fs.existsSync(envPath)) {
          dotenv.config({ path: envPath, override: false });
          loaded.push(envPath);
        }
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return loaded;
}
