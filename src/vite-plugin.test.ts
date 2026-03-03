import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("does not register watcher when schema is remote", () => {
    const plugin = typedgql({ schema: "http://localhost:4000/graphql" });
    plugin.configResolved?.(createConfig("serve"));

    const watcher = { add: vi.fn(), on: vi.fn() };
    const server = { config: { root: "/project" }, watcher, ws: { send: vi.fn() } } as any;
    plugin.configureServer?.(server);

    expect(watcher.add).not.toHaveBeenCalled();
    expect(watcher.on).not.toHaveBeenCalled();
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
