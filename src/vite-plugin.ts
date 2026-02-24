/**
 * Vite plugin for @ptdgrp/typedgql — runs codegen automatically.
 */

import type { Plugin, ResolvedConfig, Logger } from "vite";
import { Generator } from "./codegen/generator";
import { loadLocalSchema, loadRemoteSchema } from "./codegen/schema-loader";
import type { CodegenOptions } from "./codegen/options";

export interface TypedGqlPluginOptions extends Omit<
  CodegenOptions,
  "schemaLoader"
> {
  /**
   * GraphQL schema source.
   * - Local file path:  `"./schema.graphql"`
   * - Remote endpoint: `"http://localhost:4000/graphql"`
   *
   * Local file → codegen runs on startup, then re-runs on every file change.
   * Remote URL → codegen runs on every `vite dev` / `vite build` invocation.
   */
  schema: string;
  /**
   * HTTP headers forwarded when fetching a remote schema.
   * Only used when `schema` is a URL.
   */
  schemaHeaders?: Record<string, string>;
}

function isRemote(schema: string): boolean {
  return /^https?:\/\//.test(schema);
}

function makeSchemaLoader(
  schema: string,
  headers?: Record<string, string>,
): () => Promise<import("graphql").GraphQLSchema> {
  return isRemote(schema)
    ? () => loadRemoteSchema(schema, headers)
    : () => loadLocalSchema(schema);
}

/**
 * Vite plugin that runs typedgql codegen automatically.
 *
 * - **Local schema** — runs once on startup, then watches for file changes.
 * - **Remote schema** — runs on every `vite dev` / `vite build` invocation.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { typedgql } from "@ptdgrp/typedgql/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     // local file
 *     typedgql({ schema: "./schema.graphql" }),
 *     // or remote endpoint
 *     typedgql({ schema: "http://localhost:4000/graphql" }),
 *   ],
 * });
 * ```
 */
export function typedgql(options: TypedGqlPluginOptions): Plugin {
  const { schema, schemaHeaders, ...generatorOptions } = options;
  const remote = isRemote(schema);

  const codegenOptions: CodegenOptions = {
    ...generatorOptions,
    schemaLoader: makeSchemaLoader(schema, schemaHeaders),
  };

  let isRunning = false;
  let resolvedConfig: ResolvedConfig;
  let logger: Logger;

  async function runCodegen(trigger: string) {
    if (isRunning) return;
    isRunning = true;
    const label = `\x1b[36m[typedgql:${trigger}]\x1b[0m`;
    try {
      // logger.info(`${label} running codegen (schema: ${schema})`);
      const generator = new Generator(codegenOptions);
      await generator.generate();
      // logger.info(`${label} done`);
    } catch (err) {
      logger.error(`${label} failed: ${err}`);
    } finally {
      isRunning = false;
    }
  }

  return {
    name: "vite-plugin-typedgql",

    configResolved(cfg) {
      resolvedConfig = cfg;
      logger = cfg.logger;
    },

    /**
     * Runs on every `vite build` and on `vite dev` startup.
     * For remote schemas this is the only trigger.
     * For local schemas this handles the initial run; the watcher handles subsequent ones.
     */
    async buildStart() {
      const trigger = resolvedConfig?.command === "build" ? "build" : "start";
      await runCodegen(trigger);
    },

    /**
     * Dev-only: watch the local schema file and re-run on change.
     * Not registered for remote schemas — those re-run on the next dev/build start.
     */
    configureServer(server) {
      if (remote) return;

      const root = server.config.root;
      const schemaPath = new URL(schema, `file://${root}/`).pathname;

      server.watcher.add(schemaPath);
      server.watcher.on("change", async (file) => {
        if (file !== schemaPath) return;
        await runCodegen("watch");
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
