import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, mergeConfig } from "../config-loader";

describe("config-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "typedgql-config-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("loadConfig", () => {
    it("returns undefined when config file does not exist", async () => {
      await expect(loadConfig(join(tempDir, "missing.toml"))).resolves.toBeUndefined();
    });

    it("loads TOML config and normalizes outputDir to targetDir", async () => {
      const configPath = join(tempDir, ".typedgqlrc.toml");
      await writeFile(
        configPath,
        [
          'schema = "./schema.graphql"',
          'outputDir = "./src/__generated"',
          "",
          "[schemaHeaders]",
          'Authorization = "Bearer token"',
          '"X-Client" = "typedgql"',
        ].join("\n"),
      );

      await expect(loadConfig(configPath)).resolves.toEqual({
        schema: "./schema.graphql",
        outputDir: "./src/__generated",
        targetDir: "./src/__generated",
        schemaHeaders: {
          Authorization: "Bearer token",
          "X-Client": "typedgql",
        },
      });
    });

    it("preserves targetDir when outputDir is also configured", async () => {
      const configPath = join(tempDir, ".typedgqlrc.toml");
      await writeFile(
        configPath,
        [
          'schema = "./schema.graphql"',
          'outputDir = "./generated"',
          'targetDir = "./custom-generated"',
        ].join("\n"),
      );

      const config = await loadConfig(configPath);

      expect(config?.outputDir).toBe("./generated");
      expect(config?.targetDir).toBe("./custom-generated");
    });

    it("wraps parse errors with config path", async () => {
      const configPath = join(tempDir, ".typedgqlrc.toml");
      await writeFile(configPath, 'schema = "unterminated');

      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Failed to load config from ${configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
    });

    it("rejects output directories inside node_modules", async () => {
      const configPath = join(tempDir, ".typedgqlrc.toml");
      await writeFile(configPath, 'outputDir = "./node_modules/generated"');

      await expect(loadConfig(configPath)).rejects.toThrow(
        /Output directory cannot be inside node_modules/,
      );
    });
  });

  describe("mergeConfig", () => {
    it("should merge file config with programmatic config", () => {
      const fileConfig = {
        schema: "./schema.graphql",
        outputDir: "./generated",
        indent: "  ",
      };

      const programmaticConfig = {
        schema: "./other-schema.graphql",
      };

      const merged = mergeConfig(fileConfig, programmaticConfig);

      expect(merged.schema).toBe("./other-schema.graphql");
      expect(merged.outputDir).toBe("./generated");
      expect(merged.indent).toBe("  ");
    });

    it("should use programmatic config when file config is missing", () => {
      const merged = mergeConfig(undefined, {
        schema: "./schema.graphql",
        targetDir: "./generated",
      });

      expect(merged).toEqual({
        schema: "./schema.graphql",
        targetDir: "./generated",
      });
    });

    it("should throw error when outputDir is in node_modules", () => {
      const config = {
        outputDir: "./node_modules/generated",
      };

      expect(() => mergeConfig(undefined, config)).toThrow(
        /cannot be inside node_modules/i
      );
    });

    it("should throw error when targetDir is in node_modules", () => {
      const config = {
        targetDir: "./node_modules/@ptdgrp/typedgql/__generated",
      };

      expect(() => mergeConfig(undefined, config)).toThrow(
        /cannot be inside node_modules/i
      );
    });

    it("should allow outputDir outside node_modules", () => {
      const config = {
        schema: "./schema.graphql",
        outputDir: "./src/__generated",
      };

      expect(() => mergeConfig(undefined, config)).not.toThrow();
    });

    it("should normalize outputDir to targetDir", () => {
      const config = {
        schema: "./schema.graphql",
        outputDir: "./src/__generated",
      };

      const merged = mergeConfig(undefined, config);

      expect(merged.targetDir).toBe("./src/__generated");
    });

    it("should keep existing targetDir when outputDir is also present", () => {
      const merged = mergeConfig(undefined, {
        schema: "./schema.graphql",
        outputDir: "./src/__generated",
        targetDir: "./custom",
      });

      expect(merged.targetDir).toBe("./custom");
    });

    it("should merge schemaHeaders", () => {
      const fileConfig = {
        schema: "./schema.graphql",
        schemaHeaders: {
          Authorization: "Bearer token1",
          "X-Custom": "value1",
        },
      };

      const programmaticConfig = {
        schemaHeaders: {
          Authorization: "Bearer token2",
          "X-Another": "value2",
        },
      };

      const merged = mergeConfig(fileConfig, programmaticConfig);

      expect(merged.schemaHeaders).toEqual({
        Authorization: "Bearer token2",
        "X-Custom": "value1",
        "X-Another": "value2",
      });
    });
  });
});
