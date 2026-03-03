import { describe, expect, it } from "vitest";
import { createFieldOptions } from "../field-options";

describe("field options", () => {
  it("keeps latest alias and memoizes computed value", () => {
    const opts = createFieldOptions<"x">().alias("old").alias("new");
    const first = opts.value;
    const second = opts.value;

    expect(first.alias).toBe("new");
    expect(second).toBe(first);
  });

  it("keeps latest directive with same name", () => {
    const opts = createFieldOptions<"x">()
      .directive("include", { if: false })
      .directive("include", { if: true })
      .directive("tag", { name: "stable" });

    expect(opts.value.directives.get("include")).toEqual({ if: true });
    expect(opts.value.directives.get("tag")).toEqual({ name: "stable" });
  });

  it("normalizes empty directive args to undefined", () => {
    const opts = createFieldOptions<"x">().directive("skip", {});
    expect(opts.value.directives.get("skip")).toBeUndefined();
  });

  it("rejects directive name prefixed with @", () => {
    expect(() => createFieldOptions<"x">().directive("@include", { if: true })).toThrow(
      "directive name should not start with '@'",
    );
  });

  it("supports chaining alias and directives together", () => {
    const opts = createFieldOptions<"x">();
    const value = opts.alias("aliasA").directive("include", { if: true }).value;
    expect(value.alias).toBe("aliasA");
    expect(value.directives.get("include")).toEqual({ if: true });
  });
});
