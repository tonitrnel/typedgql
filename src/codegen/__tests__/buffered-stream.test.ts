import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferedStream } from "../buffered-stream";

describe("BufferedStream", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "typedgql-buffered-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("buffers written chunks and exposes content", async () => {
    const stream = new BufferedStream(join(tempDir, "output.ts"));
    const onEnd = vi.fn();

    expect(stream.path).toBe(join(tempDir, "output.ts"));
    expect(stream.write("const ")).toBe(true);
    expect(stream.write("value = 1;")).toBe(true);
    expect(stream.getContent()).toBe("const value = 1;");
    await expect(stream.end(onEnd)).resolves.toBeUndefined();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(() => stream.write("\n")).toThrow("Cannot write to ended stream");
  });

  it("provides a WriteStream-like adapter", () => {
    const stream = new BufferedStream(join(tempDir, "adapter.ts"));
    const writer = stream.toWriteStream();
    const onEnd = vi.fn();

    expect(writer.write("type ")).toBe(true);
    expect(writer.write("User = {};")).toBe(true);
    writer.end(onEnd);

    expect(onEnd).toHaveBeenCalledOnce();
    expect(stream.getContent()).toBe("type User = {};");
  });

  it("ends without a callback", async () => {
    const stream = new BufferedStream(join(tempDir, "no-callback.ts"));

    stream.write("export {};");
    await expect(stream.end()).resolves.toBeUndefined();

    expect(stream.getContent()).toBe("export {};");
  });

  it("flushes buffered content to disk", async () => {
    const path = join(tempDir, "plain.ts");
    const stream = new BufferedStream(path);

    stream.write("export const value = 1;\n");
    await stream.flush();

    await expect(readFile(path, "utf-8")).resolves.toBe("export const value = 1;\n");
  });

  it("applies a formatter before flushing", async () => {
    const path = join(tempDir, "formatted.ts");
    const stream = new BufferedStream(path);
    const formatter = vi.fn().mockResolvedValue("FORMATTED");

    stream.write("unformatted");
    await stream.flush(formatter);

    expect(formatter).toHaveBeenCalledWith("unformatted", path);
    await expect(readFile(path, "utf-8")).resolves.toBe("FORMATTED");
  });
});
