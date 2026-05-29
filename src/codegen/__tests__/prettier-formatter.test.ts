import { afterEach, describe, expect, it, vi } from "vitest";

describe("prettier-formatter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("prettier");
  });

  it("returns original code when prettier is unavailable", async () => {
    vi.doMock("prettier", () => {
      throw new Error("Cannot find module 'prettier'");
    });

    const { formatWithPrettier, isPrettierAvailable } = await import(
      "../prettier-formatter"
    );

    await expect(isPrettierAvailable()).resolves.toBe(false);
    await expect(formatWithPrettier("const x=1", "/tmp/file.ts")).resolves.toBe(
      "const x=1",
    );
  });

  it("formats TypeScript with resolved prettier config", async () => {
    const resolveConfig = vi.fn().mockResolvedValue({ semi: false });
    const format = vi.fn().mockResolvedValue("const x = 1\n");
    vi.doMock("prettier", () => ({ format, resolveConfig }));

    const { formatWithPrettier, isPrettierAvailable } = await import(
      "../prettier-formatter"
    );

    await expect(isPrettierAvailable()).resolves.toBe(true);
    await expect(formatWithPrettier("const x=1", "/tmp/file.ts")).resolves.toBe(
      "const x = 1\n",
    );
    expect(resolveConfig).toHaveBeenCalledWith("/tmp/file.ts");
    expect(format).toHaveBeenCalledWith("const x=1", {
      semi: false,
      parser: "typescript",
      filepath: "/tmp/file.ts",
    });
  });

  it("returns original code and warns when formatting fails", async () => {
    const resolveConfig = vi.fn().mockResolvedValue(null);
    const format = vi.fn().mockRejectedValue(new Error("bad syntax"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("prettier", () => ({ format, resolveConfig }));

    const { formatWithPrettier } = await import("../prettier-formatter");

    await expect(formatWithPrettier("const = ;", "/tmp/bad.ts")).resolves.toBe(
      "const = ;",
    );
    expect(warn).toHaveBeenCalledWith(
      "[typedgql] Failed to format /tmp/bad.ts with prettier: bad syntax",
    );
  });

  it("can reset prettier detection state", async () => {
    const resolveConfig = vi.fn().mockResolvedValue({});
    const format = vi.fn().mockResolvedValue("formatted");
    vi.doMock("prettier", () => ({ format, resolveConfig }));

    const { isPrettierAvailable, resetPrettierDetection } = await import(
      "../prettier-formatter"
    );

    await expect(isPrettierAvailable()).resolves.toBe(true);
    resetPrettierDetection();
    await expect(isPrettierAvailable()).resolves.toBe(true);
  });
});
