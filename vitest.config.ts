import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.ts", "tests/**"],
    },
  },
  resolve: {
    alias: {
      "@ptdgrp/typedgql/runtime": resolve(__dirname, "src/runtime.ts"),
      "@ptdgrp/typedgql": resolve(__dirname, "src/index.ts"),
    },
  },
});
