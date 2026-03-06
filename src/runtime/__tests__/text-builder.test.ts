import { describe, expect, it } from "vitest";
import { TextBuilder } from "../text-builder";

describe("TextBuilder", () => {
  it("supports scope prefix/suffix and custom separators", () => {
    const builder = new TextBuilder("  ");
    builder.scope(
      {
        type: "arguments",
        prefix: "fn",
        suffix: ";",
        separator: " | ",
      },
      () => {
        builder.text("a");
        builder.separator();
        builder.text("b");
      },
    );

    expect(builder.toString()).toBe("fn(a | b);");
  });

  it("ignores separator before first value in scope", () => {
    const builder = new TextBuilder();
    builder.scope({ type: "array" }, () => {
      builder.separator();
      builder.text("1");
      builder.separator();
      builder.text("2");
    });

    expect(builder.toString()).toBe("[1, 2]");
  });

  it("throws when separator() is called without an active scope", () => {
    const builder = new TextBuilder();
    expect(() => builder.separator()).toThrow("No existing scope");
  });
});
