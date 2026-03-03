import { describe, expect, it } from "vitest";
import { ParameterRef } from "../parameter";

describe("parameter ref", () => {
  it("creates refs with optional graphql type", () => {
    const a = ParameterRef.of("id");
    expect(a.name).toBe("id");
    expect(a.graphqlTypeName).toBeUndefined();

    const b = ParameterRef.of("cond", "Boolean!");
    expect(b.name).toBe("cond");
    expect(b.graphqlTypeName).toBe("Boolean!");
  });

  it("rejects names prefixed with $", () => {
    expect(() => ParameterRef.of("$id")).toThrow(
      "parameter name cannot start with '$'",
    );
  });
});

