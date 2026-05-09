import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "dist/**",
        "src/infra/db/migrate.ts",
        "src/openapi/export-openapi.ts",
        "src/server.ts",
        "src/test/**",
        "vitest.config.ts",
      ],
      include: ["src/**/*.ts"],
      provider: "v8",
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "threads",
  },
});
