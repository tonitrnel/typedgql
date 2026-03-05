import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => {
  const generate = vi.fn<() => Promise<void>>();
  const generatorCtor = vi.fn(function (this: { generate: typeof generate }) {
    this.generate = generate;
  });
  const loadLocalSchema = vi.fn();
  const loadRemoteSchema = vi.fn();
  return { generate, generatorCtor, loadLocalSchema, loadRemoteSchema };
});

vi.mock("./codegen/generator", () => ({
  Generator: mocks.generatorCtor,
}));

vi.mock("./codegen/schema-loader", () => ({
  loadLocalSchema: mocks.loadLocalSchema,
  loadRemoteSchema: mocks.loadRemoteSchema,
}));

import { typedgql } from "./vite-plugin";

function createConfig(command: "serve" | "build" = "serve") {
  return {
    command,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.generate.mockResolvedValue(undefined);
});

describe("typedgql vite plugin", () => {
  it("injects optimizeDeps exclude and watch ignore override for devDependencyHmr", () => {
    const plugin = typedgql({
      schema: "./schema.graphql",
      devDependencyHmr: true,
    });
    const cfg = plugin.config?.({
      optimizeDeps: { exclude: ["foo"] },
      server: { watch: { ignored: ["**/.git/**"] } },
    } as any);

    expect(cfg).toBeDefined();
    expect(cfg?.optimizeDeps?.exclude).toContain("foo");
    expect(cfg?.optimizeDeps?.exclude).toContain("@ptdgrp/typedgql");
    expect(cfg?.server?.watch?.ignored).toContain("**/.git/**");
    expect(cfg?.server?.watch?.ignored).toContain("!**/node_modules/@ptdgrp/typedgql/**");
  });

  it("uses local schema loader for local schema path", async () => {
    const plugin = typedgql({ schema: "./schema.graphql", targetDir: "src/generated" });
    plugin.configResolved?.(createConfig("serve"));

    await plugin.buildStart?.call({});
    expect(mocks.generatorCtor).toHaveBeenCalledTimes(1);

    const options = mocks.generatorCtor.mock.calls[0]?.[0];
    expect(options.targetDir).toBe("src/generated");

    await options.schemaLoader();
    expect(mocks.loadLocalSchema).toHaveBeenCalledWith("./schema.graphql");
    expect(mocks.loadRemoteSchema).not.toHaveBeenCalled();
  });

  it("uses remote schema loader and forwards headers for remote schema URL", async () => {
    const plugin = typedgql({
      schema: "https://api.example.com/graphql",
      schemaHeaders: { Authorization: "Bearer token" },
    });
    plugin.configResolved?.(createConfig("build"));

    await plugin.buildStart?.call({});
    expect(mocks.generatorCtor).toHaveBeenCalledTimes(1);

    const options = mocks.generatorCtor.mock.calls[0]?.[0];
    await options.schemaLoader();
    expect(mocks.loadRemoteSchema).toHaveBeenCalledWith(
      "https://api.example.com/graphql",
      { Authorization: "Bearer token" },
    );
    expect(mocks.loadLocalSchema).not.toHaveBeenCalled();
  });

  it("watches local schema changes and triggers reload", async () => {
    const plugin = typedgql({ schema: "./schema.graphql" });
    plugin.configResolved?.(createConfig("serve"));

    let onChange: ((file: string) => Promise<void>) | undefined;
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, cb: (file: string) => Promise<void>) => {
        if (event === "change") onChange = cb;
      }),
    };
    const ws = { send: vi.fn() };
    const server = { config: { root: "/project" }, watcher, ws } as any;

    plugin.configureServer?.(server);
    const schemaPath = new URL("./schema.graphql", "file:///project/").pathname;
    expect(watcher.add).toHaveBeenCalledWith(schemaPath);
    expect(onChange).toBeDefined();

    await onChange?.("/project/other.graphql");
    expect(ws.send).not.toHaveBeenCalled();

    await onChange?.(schemaPath);
    expect(mocks.generatorCtor).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith({ type: "full-reload" });
  });

  it("skips codegen when schema file content hash is unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "typedgql-vite-plugin-"));
    const schemaDir = join(root, "schema");
    await mkdir(schemaDir, { recursive: true });
    const schemaPath = join(schemaDir, "schema.graphql");
    await writeFile(schemaPath, "type Query { id: ID! }", "utf8");

    const plugin = typedgql({ schema: "./schema/schema.graphql" });
    plugin.configResolved?.(createConfig("serve"));

    let onChange: ((file: string) => Promise<void>) | undefined;
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, cb: (file: string) => Promise<void>) => {
        if (event === "change") onChange = cb;
      }),
    };
    const ws = { send: vi.fn() };
    const server = { config: { root }, watcher, ws } as any;
    plugin.configureServer?.(server);

    expect(onChange).toBeDefined();
    await onChange?.(schemaPath);
    expect(mocks.generatorCtor).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();

    await rm(root, { recursive: true, force: true });
  });

  it("runs codegen when schema file content changes and updates hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "typedgql-vite-plugin-change-"));
    const schemaDir = join(root, "schema");
    await mkdir(schemaDir, { recursive: true });
    const schemaPath = join(schemaDir, "schema.graphql");
    await writeFile(schemaPath, "type Query { id: ID! }", "utf8");

    const plugin = typedgql({ schema: "./schema/schema.graphql" });
    plugin.configResolved?.(createConfig("serve"));

    let onChange: ((file: string) => Promise<void>) | undefined;
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, cb: (file: string) => Promise<void>) => {
        if (event === "change") onChange = cb;
      }),
    };
    const ws = { send: vi.fn() };
    const server = { config: { root }, watcher, ws } as any;
    plugin.configureServer?.(server);

    expect(onChange).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(schemaPath, "type Query { id: ID!, name: String }", "utf8");
    await onChange?.(schemaPath);
    expect(mocks.generatorCtor).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith({ type: "full-reload" });

    await rm(root, { recursive: true, force: true });
  });

  it("does not register watcher when schema is remote", () => {
    const plugin = typedgql({ schema: "http://localhost:4000/graphql" });
    plugin.configResolved?.(createConfig("serve"));

    const watcher = { add: vi.fn(), on: vi.fn() };
    const server = { config: { root: "/project" }, watcher, ws: { send: vi.fn() } } as any;
    plugin.configureServer?.(server);

    expect(watcher.add).not.toHaveBeenCalled();
    expect(watcher.on).not.toHaveBeenCalled();
  });

  it("watches dependency directory and triggers full-reload by default", async () => {
    const plugin = typedgql({
      schema: "./schema.graphql",
      devDependencyHmr: true,
    });
    plugin.configResolved?.(createConfig("serve"));

    const changeHandlers: Array<(file: string) => Promise<void>> = [];
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, cb: (file: string) => Promise<void>) => {
        if (event === "change") changeHandlers.push(cb);
      }),
    };
    const ws = { send: vi.fn() };
    const server = {
      config: { root: "/project" },
      watcher,
      ws,
      restart: vi.fn(),
    } as any;

    plugin.configureServer?.(server);
    expect(watcher.add).toHaveBeenCalledWith("/project/node_modules/@ptdgrp/typedgql/dist");
    expect(changeHandlers.length).toBeGreaterThan(0);

    for (const cb of changeHandlers) {
      await cb("/project/node_modules/@ptdgrp/typedgql/dist/index.mjs");
    }
    expect(ws.send).toHaveBeenCalledWith({ type: "full-reload" });
    expect(server.restart).not.toHaveBeenCalled();
  });

  it("supports restart strategy for dependency directory watcher", async () => {
    const plugin = typedgql({
      schema: "./schema.graphql",
      devDependencyHmr: { strategy: "restart" },
    });
    plugin.configResolved?.(createConfig("serve"));

    const changeHandlers: Array<(file: string) => Promise<void>> = [];
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, cb: (file: string) => Promise<void>) => {
        if (event === "change") changeHandlers.push(cb);
      }),
    };
    const ws = { send: vi.fn() };
    const restart = vi.fn(async () => {});
    const server = {
      config: { root: "/project" },
      watcher,
      ws,
      restart,
    } as any;

    plugin.configureServer?.(server);
    expect(watcher.add).toHaveBeenCalledWith(
      "/project/node_modules/@ptdgrp/typedgql/dist",
    );
    expect(changeHandlers.length).toBeGreaterThan(0);

    for (const cb of changeHandlers) {
      await cb("/project/node_modules/@ptdgrp/typedgql/dist/runtime/proxy.mjs");
    }
    expect(restart).toHaveBeenCalledTimes(1);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("prevents concurrent codegen runs and logs errors", async () => {
    const logger = createConfig("serve").logger;
    const plugin = typedgql({ schema: "./schema.graphql" });
    plugin.configResolved?.({ command: "serve", logger } as any);

    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.generate.mockImplementationOnce(() => pending);

    const p1 = plugin.buildStart?.call({});
    const p2 = plugin.buildStart?.call({});
    await Promise.resolve();
    expect(mocks.generatorCtor).toHaveBeenCalledTimes(1);

    release?.();
    await p1;
    await p2;

    mocks.generate.mockRejectedValueOnce(new Error("boom"));
    await plugin.buildStart?.call({});
    expect(logger.error).toHaveBeenCalled();
    expect(String(logger.error.mock.calls[0]?.[0])).toContain("[typedgql:start]");
  });
});
