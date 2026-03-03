import { describe, expect, it } from "vitest";
import { EnumInputMetadataBuilder } from "../enum-metadata";

describe("enum input metadata builder", () => {
  it("builds enum and nested input metadata graph", () => {
    const meta = new EnumInputMetadataBuilder()
      .add("Status")
      .add("Filter", [{ name: "status", typeName: "Status", graphqlTypeName: "Status!" }])
      .build();

    const status = meta.get("Status");
    expect(status?.type).toBe("ENUM");
    expect(status?.fields).toBeUndefined();

    const filter = meta.get("Filter");
    expect(filter?.type).toBe("INPUT");
    expect(filter?.fields?.get("status")?.name).toBe("Status");
    expect(filter?.fieldGraphQLTypeMap?.get("status")).toBe("Status!");
  });

  it("throws when referenced enum/input type is unknown", () => {
    const builder = new EnumInputMetadataBuilder().add("Filter", [
      { name: "status", typeName: "MissingStatus" },
    ]);
    expect(() => builder.build()).toThrow("Unknown enum/input type: 'MissingStatus'");
  });
});
