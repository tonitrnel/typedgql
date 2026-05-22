import { readFile } from "node:fs/promises";
import { resolve, normalize } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { CodegenOptions } from "./options";

/**
 * Validate that the output directory is not inside node_modules.
 * @throws Error if the path is inside node_modules
 */
function validateOutputDir(outputDir: string): void {
  const normalizedPath = normalize(outputDir);
  if (normalizedPath.includes("node_modules")) {
    throw new Error(
      `Invalid outputDir: "${outputDir}". ` +
      "Output directory cannot be inside node_modules. " +
      "Please specify a path outside node_modules, such as './src/__generated' or './__generated'."
    );
  }
}

/**
 * Configuration file format for .typedgqlrc.toml
 * Matches CodegenOptions but with schema-related fields for file-based config.
 */
export interface TypedGqlConfig
  extends Omit<CodegenOptions, "schemaLoader"> {
  /**
   * GraphQL schema source.
   * - Local file path:  `"./schema.graphql"`
   * - Remote endpoint: `"http://localhost:4000/graphql"`
   */
  schema?: string;
  /**
   * HTTP headers forwarded when fetching a remote schema.
   * Only used when `schema` is a URL.
   */
  schemaHeaders?: Record<string, string>;
  /**
   * Output directory for generated files.
   * Alias for `targetDir` for better clarity.
   */
  outputDir?: string;
}

/**
 * Load configuration from .typedgqlrc.toml file.
 *
 * @param configPath - Path to the config file (defaults to .typedgqlrc.toml in cwd)
 * @returns Parsed configuration object or undefined if file doesn't exist
 */
export async function loadConfig(
  configPath?: string,
): Promise<TypedGqlConfig | undefined> {
  const path = configPath ?? resolve(process.cwd(), ".typedgqlrc.toml");

  try {
    const content = await readFile(path, "utf-8");
    const config = parseToml(content) as TypedGqlConfig;

    // Normalize outputDir to targetDir
    if (config.outputDir && !config.targetDir) {
      config.targetDir = config.outputDir;
    }

    // Validate outputDir/targetDir is not in node_modules
    const outputPath = config.outputDir || config.targetDir;
    if (outputPath) {
      validateOutputDir(outputPath);
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new Error(
      `Failed to load config from ${path}: ${(error as Error).message}`,
    );
  }
}

/**
 * Merge configuration from file with programmatic options.
 * Programmatic options take precedence over file config.
 *
 * @param fileConfig - Configuration loaded from .typedgqlrc.toml
 * @param programmaticConfig - Configuration passed programmatically
 * @returns Merged configuration
 */
export function mergeConfig(
  fileConfig: TypedGqlConfig | undefined,
  programmaticConfig: Partial<TypedGqlConfig>,
): TypedGqlConfig {
  let merged: TypedGqlConfig;
  
  if (!fileConfig) {
    merged = programmaticConfig as TypedGqlConfig;
  } else {
    merged = {
      ...fileConfig,
      ...programmaticConfig,
      // Merge schemaHeaders if both exist
      schemaHeaders: {
        ...fileConfig.schemaHeaders,
        ...programmaticConfig.schemaHeaders,
      },
    };
  }

  // Normalize outputDir to targetDir
  if (merged.outputDir && !merged.targetDir) {
    merged.targetDir = merged.outputDir;
  }

  // Validate merged config
  const outputPath = merged.outputDir || merged.targetDir;
  if (outputPath) {
    validateOutputDir(outputPath);
  }

  return merged;
}
