import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.mts"],
  },
  resolve: {
    alias: {
      "@srs/object-service": path.resolve(__dirname, "packages/object-service/dist/index.js"),
      "@srs/project-context": path.resolve(__dirname, "packages/project-context/dist/index.js"),
      "@srs/auth": path.resolve(__dirname, "packages/auth/dist/index.js"),
      "@srs/release-service": path.resolve(__dirname, "packages/release-service/dist/index.js"),
      "@srs/shared-kernel": path.resolve(__dirname, "packages/shared-kernel/dist/index.js"),
    },
  },
});
