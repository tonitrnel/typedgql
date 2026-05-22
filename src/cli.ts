#!/usr/bin/env node

/**
 * TypedGQL CLI
 * 
 * Simple command-line tool to generate TypeScript types from GraphQL schema
 * using configuration from .typedgqlrc.toml
 */

import { Generator } from "./codegen/generator";
import { loadConfig } from "./codegen/config-loader";
import { loadLocalSchema, loadRemoteSchema } from "./codegen/schema-loader";

const isRemote = (schema: string): boolean => {
  return /^https?:\/\//.test(schema);
};

async function main() {
  try {
    console.log("[typedgql] Loading configuration from .typedgqlrc.toml...");
    
    // Load configuration file
    const config = await loadConfig();
    
    if (!config) {
      console.error(
        "[typedgql] Error: No .typedgqlrc.toml configuration file found.\n" +
        "Please create a .typedgqlrc.toml file in your project root.\n" +
        "See: https://github.com/tonitrnel/typedgql#configuration"
      );
      process.exit(1);
      return;
    }

    if (!config.schema) {
      console.error(
        "[typedgql] Error: 'schema' option is required in .typedgqlrc.toml\n" +
        "Please specify a schema source:\n" +
        '  schema = "./schema.graphql"  # Local file\n' +
        '  schema = "http://localhost:4000/graphql"  # Remote endpoint'
      );
      process.exit(1);
      return;
    }

    console.log(`[typedgql] Schema source: ${config.schema}`);
    
    if (config.targetDir || config.outputDir) {
      console.log(`[typedgql] Output directory: ${config.targetDir || config.outputDir}`);
    }

    // Create schema loader
    const schemaLoader = isRemote(config.schema)
      ? () => loadRemoteSchema(config.schema!, config.schemaHeaders)
      : () => loadLocalSchema(config.schema!);

    // Create generator
    const generator = new Generator({
      ...config,
      schemaLoader,
    });

    console.log("[typedgql] Generating TypeScript types...");
    
    // Run generation
    await generator.generate();

    console.log("[typedgql] ✓ Generation complete!");
    process.exit(0);
  } catch (error) {
    console.error("[typedgql] Error:", (error as Error).message);
    if (process.env.DEBUG) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

// Run CLI
main();
