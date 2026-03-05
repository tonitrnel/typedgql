/**
 * Vite plugin for @ptdgrp/typedgql — runs codegen automatically.
 */

import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig, Logger, UserConfig } from "vite";
import { normalizePath } from "vite";
import { Generator } from "./codegen/generator";
import { loadLocalSchema, loadRemoteSchema } from "./codegen/schema-loader";
import type { CodegenOptions } from "./codegen/options";

export interface DevDependencyHmrOptions {
  /**
   * How to refresh dev server when watched dependency files change.
   *
   * - "reload": send full page reload
   * - "restart": restart Vite dev server
   *
   * @default "reload"
   */
  strategy?: "reload" | "restart";
}

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
  /**
   * Optional dev-time watcher for dependency files in node_modules.
   * Useful when developing typedgql as an installed package rather than workspace source.
   */
  devDependencyHmr?: boolean | DevDependencyHmrOptions;
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

function resolveDevDependencyHmr(
  option: boolean | DevDependencyHmrOptions | undefined,
): { strategy: "reload" | "restart" } | undefined {
  if (!option) return undefined;
  if (option === true) {
    return { strategy: "reload" };
  }
  return { strategy: option.strategy ?? "reload" };
}

function buildNegatedWatchPattern(packageName: string): string {
  return `!**/node_modules/${packageName}/**`;
}

const DEV_DEP_HMR_PACKAGE_NAME = "@ptdgrp/typedgql";
const DEV_DEP_HMR_WATCH_DIRS = ["dist"] as const;

async function hashFile(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return undefined;
  }
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
  const { schema, schemaHeaders, devDependencyHmr, ...generatorOptions } = options;
  const remote = isRemote(schema);
  const depHmr = resolveDevDependencyHmr(devDependencyHmr);

  const codegenOptions: CodegenOptions = {
    ...generatorOptions,
    schemaLoader: makeSchemaLoader(schema, schemaHeaders),
  };

  let isRunning = false;
  let isDependencyRefreshRunning = false;
  let lastSchemaHash: string | undefined;
  let initSchemaHashPromise: Promise<void> | undefined;
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

    config(config): UserConfig | void {
      if (!depHmr) return;
      const negatedPattern = buildNegatedWatchPattern(DEV_DEP_HMR_PACKAGE_NAME);
      const exclude = new Set(config.optimizeDeps?.exclude ?? []);
      exclude.add(DEV_DEP_HMR_PACKAGE_NAME);
      const watchIgnored = config.server?.watch?.ignored;
      const mergedIgnored = Array.isArray(watchIgnored)
        ? [...watchIgnored, negatedPattern]
        : watchIgnored === undefined
          ? [negatedPattern]
          : watchIgnored;
      return {
        optimizeDeps: {
          exclude: Array.from(exclude),
        },
        server: {
          watch: {
            ignored: mergedIgnored,
          },
        },
      };
    },

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
      if (depHmr) {
        const packageRoot = normalizePath(
          resolve(server.config.root, "node_modules", DEV_DEP_HMR_PACKAGE_NAME),
        );
        const watchedDirs = DEV_DEP_HMR_WATCH_DIRS.map((dir) =>
          normalizePath(resolve(packageRoot, dir)),
        );
        for (const dir of watchedDirs) {
          server.watcher.add(dir);
        }
        server.watcher.on("change", async (file) => {
          const changedPath = normalizePath(file);
          if (!watchedDirs.some((dir) => changedPath.startsWith(dir))) return;
          if (isDependencyRefreshRunning) return;
          isDependencyRefreshRunning = true;
          try {
            if (depHmr.strategy === "restart") {
              await server.restart();
            } else {
              server.ws.send({ type: "full-reload" });
            }
          } finally {
            isDependencyRefreshRunning = false;
          }
        });
      }

      if (remote) return;

      const root = server.config.root;
      const schemaPath = normalizePath(resolve(root, schema));
      let realSchemaPath = schemaPath;
      void realpath(schemaPath)
        .then((actualPath) => {
          realSchemaPath = normalizePath(actualPath);
        })
        .catch(() => {
          // Ignore when schema path is not resolvable yet.
        });

      server.watcher.add(schemaPath);
      initSchemaHashPromise = hashFile(schemaPath).then((hash) => {
        lastSchemaHash = hash;
      });
      server.watcher.on("change", async (file) => {
        const changedPath = normalizePath(file);
        if (changedPath !== schemaPath && changedPath !== realSchemaPath) return;
        await initSchemaHashPromise;
        const nextHash = await hashFile(schemaPath);
        if (nextHash && nextHash === lastSchemaHash) return;
        await runCodegen("watch");
        if (nextHash) {
          lastSchemaHash = nextHash;
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
