import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("typedgql cli", () => {
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./codegen/config-loader");
    vi.doUnmock("./codegen/schema-loader");
    vi.doUnmock("./codegen/generator");
  });

  function mockCliDependencies(config: unknown, generate = vi.fn().mockResolvedValue(undefined)) {
    const loadConfig = vi.fn().mockResolvedValue(config);
    const loadLocalSchema = vi.fn().mockResolvedValue("local schema");
    const loadRemoteSchema = vi.fn().mockResolvedValue("remote schema");
    const Generator = vi.fn().mockImplementation(function (_options) {
      const options = _options;
      return {
        options,
        generate,
      };
    });

    vi.doMock("./codegen/config-loader", () => ({ loadConfig }));
    vi.doMock("./codegen/schema-loader", () => ({
      loadLocalSchema,
      loadRemoteSchema,
    }));
    vi.doMock("./codegen/generator", () => ({ Generator }));

    return {
      Generator,
      generate,
      loadConfig,
      loadLocalSchema,
      loadRemoteSchema,
    };
  }

  it("loads local schema config and runs generation", async () => {
    const mocks = mockCliDependencies({
      schema: "./schema.graphql",
      outputDir: "./src/__generated",
    });

    await import("./cli");

    await vi.waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledOnce();
    });
    expect(mocks.loadConfig).toHaveBeenCalledOnce();
    expect(mocks.Generator).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: "./schema.graphql",
        outputDir: "./src/__generated",
        schemaLoader: expect.any(Function),
      }),
    );
    expect(process.exit).toHaveBeenCalledWith(0);

    const options = mocks.Generator.mock.calls[0]![0];
    await expect(options.schemaLoader()).resolves.toBe("local schema");
    expect(mocks.loadLocalSchema).toHaveBeenCalledWith("./schema.graphql");
  });

  it("loads remote schema config with headers", async () => {
    const schemaHeaders = { Authorization: "Bearer token" };
    const mocks = mockCliDependencies({
      schema: "https://example.com/graphql",
      targetDir: "./generated",
      schemaHeaders,
    });

    await import("./cli");

    await vi.waitFor(() => {
      expect(process.exit).toHaveBeenCalledWith(0);
    });
    const options = mocks.Generator.mock.calls[0]![0];
    await expect(options.schemaLoader()).resolves.toBe("remote schema");
    expect(mocks.loadRemoteSchema).toHaveBeenCalledWith(
      "https://example.com/graphql",
      schemaHeaders,
    );
  });

  it("exits when no config file is found", async () => {
    mockCliDependencies(undefined);

    await import("./cli");

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("No .typedgqlrc.toml configuration file found"),
      );
    });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("exits when schema is missing", async () => {
    mockCliDependencies({ outputDir: "./generated" });

    await import("./cli");

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("'schema' option is required"),
      );
    });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("reports generator errors and debug stacks", async () => {
    process.env.DEBUG = "1";
    const error = new Error("generation failed");
    const generate = vi.fn().mockRejectedValue(error);
    mockCliDependencies({ schema: "./schema.graphql" }, generate);

    await import("./cli");

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        "[typedgql] Error:",
        "generation failed",
      );
    });
    expect(console.error).toHaveBeenCalledWith(error.stack);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
