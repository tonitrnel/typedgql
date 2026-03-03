import { describe, expect, it, vi } from "vitest";
import { EnumInputMetadataBuilder } from "../enum-metadata";
import { ParameterRef } from "../parameter";
import { createSchemaType } from "../schema";
import { SelectionImpl } from "../selection";
import { StringValue } from "../types";

function createRoot(schemaType: ReturnType<typeof createSchemaType>) {
  return new SelectionImpl(
    [schemaType, new EnumInputMetadataBuilder().build(), undefined],
    false,
    "",
  );
}

describe("selection serialization and guards", () => {
  it("rejects removing __typename and invalid fragment names", () => {
    const queryType = createSchemaType("SelectionQueryA", "OBJECT", [], ["id"]);
    const nodeType = createSchemaType("SelectionNodeA", "OBJECT", [], ["id"]);
    const root = createRoot(queryType);
    const child = createRoot(nodeType).addField("id");

    expect(() => root.removeField("__typename")).toThrow(
      "__typename cannot be removed",
    );
    expect(() => root.addEmbeddable(child, "")).toThrow(
      "fragmentName cannot be ''",
    );
    expect(() => root.addEmbeddable(child, "on Node")).toThrow(
      "fragmentName cannot start with 'on '",
    );
  });

  it("throws when named fragment has conflicting selections", () => {
    const queryType = createSchemaType("SelectionQueryB", "OBJECT", [], ["id"]);
    const nodeType = createSchemaType("SelectionNodeB", "OBJECT", [], [
      "id",
      "name",
    ]);
    const root = createRoot(queryType);
    const s1 = createRoot(nodeType).addField("id");
    const s2 = createRoot(nodeType).addField("name");
    const withFragments = root
      .addEmbeddable(s1, "shared")
      .addEmbeddable(s2, "shared ");

    expect(() => withFragments.toFragmentString()).toThrow(
      "Conflict fragment name shared",
    );
  });

  it("flattens inline embeddable selections in current scope", () => {
    const queryType = createSchemaType("SelectionInlineSpreadQuery", "OBJECT", [], ["id"]);
    const root = createRoot(queryType).addEmbeddable(createRoot(queryType).addField("id"));

    const text = root.toString();
    expect(text).toContain("id");
    expect(text).not.toContain("...");
  });

  it("writes named fragment body into fragment text", () => {
    const queryType = createSchemaType("SelectionNamedFragmentQuery", "OBJECT", [], ["id"]);
    const nodeType = createSchemaType("SelectionNamedFragmentNode", "OBJECT", [], ["name"]);
    const root = createRoot(queryType).addEmbeddable(
      createRoot(nodeType).addField("name"),
      "nodeFields",
    );

    const fragmentText = root.toFragmentString();
    expect(fragmentText).toContain("fragment nodeFields on SelectionNamedFragmentNode");
    expect(fragmentText).toContain("name");
  });

  it("warns and skips unknown field args", () => {
    const queryType = createSchemaType("SelectionQueryC", "OBJECT", [], [
      {
        name: "search",
        category: "SCALAR",
        argGraphQLTypeMap: { known: "String" },
      },
    ]);
    const root = createRoot(queryType).addField("search", { unexpected: "x" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const text = root.toString();

    expect(text).toContain("search");
    expect(text).not.toContain("unexpected");
    expect(warn).toHaveBeenCalledWith("Unexpected argument: unexpected");
    warn.mockRestore();
  });

  it("throws unknown argument when known and unknown args are mixed", () => {
    const queryType = createSchemaType("SelectionQueryUnknownMixedArgs", "OBJECT", [], [
      {
        name: "search",
        category: "SCALAR",
        argGraphQLTypeMap: { known: "String!" },
      },
    ]);
    const root = createRoot(queryType).addField("search", {
      known: "ok",
      unknown: "x",
    });

    expect(() => root.toString()).toThrow("Unknown argument 'unknown'");
  });

  it("throws on invalid argument variable typing conflicts", () => {
    const queryType = createSchemaType("SelectionQueryD", "OBJECT", [], [
      {
        name: "byId",
        category: "SCALAR",
        argGraphQLTypeMap: { id: "ID!" },
      },
      {
        name: "a",
        category: "SCALAR",
        argGraphQLTypeMap: { value: "Int!" },
      },
      {
        name: "b",
        category: "SCALAR",
        argGraphQLTypeMap: { value: "String!" },
      },
    ]);

    const mismatchRef = createRoot(queryType).addField("byId", {
      id: ParameterRef.of("id", "String!"),
    });
    expect(() => mismatchRef.toString()).toThrow(
      "Argument 'id' type conflict: 'ID!' vs ParameterRef 'String!'",
    );

    const conflictVar = createRoot(queryType)
      .addField("a", { value: ParameterRef.of("v") })
      .addField("b", { value: ParameterRef.of("v") });
    expect(() => conflictVar.toString()).toThrow(
      "Argument 'v' type conflict: 'Int!' vs 'String!'",
    );
  });

  it("throws on invalid directive parameter ref and supports enum/string literals", () => {
    const enumMeta = new EnumInputMetadataBuilder()
      .add("Status")
      .add("Filter", [{ name: "status", typeName: "Status" }])
      .build();
    const queryType = createSchemaType("SelectionQueryE", "OBJECT", [], [
      {
        name: "search",
        category: "SCALAR",
        argGraphQLTypeMap: { filter: "Filter", expr: "String" },
      },
    ]);
    const root = new SelectionImpl([queryType, enumMeta, undefined], false, "");

    const directiveRef = root
      .addField("search", { filter: { status: "ACTIVE" } })
      .addDirective("include", { if: ParameterRef.of("cond") });
    expect(() => directiveRef.toString()).toThrow(
      "Directive argument 'cond' requires graphqlTypeName",
    );

    const literalSelection = root.addField("search", {
      filter: { status: "ACTIVE" },
      expr: new StringValue("NOW()", false),
    });
    const text = literalSelection.toString();
    expect(text).toContain("status: ACTIVE");
    expect(text).toContain("expr: NOW()");
  });

  it("supports directive parameter refs with explicit graphql types", () => {
    const queryType = createSchemaType("SelectionQueryDirRef", "OBJECT", [], ["id"]);
    const root = createRoot(queryType)
      .addField("id")
      .addDirective("include", { if: ParameterRef.of("cond", "Boolean!") });

    const text = root.toString();
    expect(text).toContain("if: $cond");
    expect(root.variableTypeMap.get("cond")).toBe("Boolean!");
  });

  it("serializes Map/Set/StringValue literals in directive args", () => {
    const queryType = createSchemaType("SelectionQueryF", "OBJECT", [], ["id"]);
    const root = createRoot(queryType)
      .addField("id")
      .addDirective("meta", {
        payload: new Map([["k", "v"]]),
        flags: new Set(["A", "B"]),
        quoted: new StringValue("raw", true),
      } as any);

    const text = root.toString();
    expect(text).toContain("@meta");
    expect(text).toContain("payload: {k: \"v\"}");
    expect(text).toContain("flags: [\"A\", \"B\"]");
    expect(text).toContain("quoted: \"raw\"");
  });

  it("infers nested parameter refs inside list arguments", () => {
    const queryType = createSchemaType("SelectionQueryI", "OBJECT", [], [
      {
        name: "batch",
        category: "SCALAR",
        argGraphQLTypeMap: { ids: "[ID!]!" },
      },
    ]);
    const root = createRoot(queryType).addField("batch", {
      ids: [ParameterRef.of("id1"), ParameterRef.of("id2", "ID!")],
    });

    const text = root.toString();
    expect(text).toContain("ids: [$id1, $id2]");
    expect(root.variableTypeMap.get("id1")).toBe("ID!");
    expect(root.variableTypeMap.get("id2")).toBe("ID!");
  });

  it("throws when nested parameter ref type cannot be inferred", () => {
    const queryType = createSchemaType("SelectionQueryInferErr", "OBJECT", [], ["id"]);
    const root = createRoot(queryType)
      .addField("id")
      .addDirective("meta", { payload: { value: ParameterRef.of("unknownNestedType") } });

    expect(() => root.toString()).toThrow(
      "Argument 'unknownNestedType' nested type cannot be inferred; provide graphqlTypeName",
    );
  });

  it("handles array args when declared graphql type is not a list", () => {
    const queryType = createSchemaType("SelectionQueryArrayScalar", "OBJECT", [], [
      {
        name: "batch",
        category: "SCALAR",
        argGraphQLTypeMap: { ids: "ID" },
      },
    ]);
    const root = createRoot(queryType).addField("batch", {
      ids: [ParameterRef.of("idSingle", "ID")],
    });

    const text = root.toString();
    expect(text).toContain("ids: [$idSingle]");
    expect(root.variableTypeMap.get("idSingle")).toBe("ID");
  });

  it("renders array directive args using multi-line argument mode", () => {
    const queryType = createSchemaType("SelectionQueryG", "OBJECT", [], ["id"]);
    const root = createRoot(queryType).addField("id").addDirective("arr", [
      1,
      2,
      3,
    ] as any);

    const text = root.toString();
    expect(text).toContain("@arr");
    expect(text).toContain("0: 1");
    expect(text).toContain("1: 2");
    expect(text).toContain("2: 3");
  });

  it("throws when findFieldByName sees duplicate matches", () => {
    const rootType = createSchemaType("SelectionQueryH", "OBJECT", [], ["id"]);
    const childType = createSchemaType("SelectionNodeH", "OBJECT", [], ["id"]);
    const root = createRoot(rootType)
      .addEmbeddable(createRoot(childType).addField("id"))
      .addEmbeddable(createRoot(childType).addField("id"));

    expect(() => root.findFieldByName("id")).toThrow(
      'Too many fields named "id" in selection of type "SelectionQueryH"',
    );
  });

  it("returns undefined for missing field lookups and supports toJSON", () => {
    const queryType = createSchemaType("SelectionQueryLookup", "OBJECT", [], ["id"]);
    const root = createRoot(queryType).addField("id");

    expect(root.findField("missing")).toBeUndefined();
    expect(root.findFieldByName("missing")).toBeUndefined();

    const json = root.toJSON();
    expect(json).toContain("\"text\"");
    expect(json).toContain("\"variableTypeMap\"");
  });

  it("findField can resolve nested fields through embeddable selections", () => {
    const queryType = createSchemaType("SelectionQueryFindNested", "OBJECT", [], ["id"]);
    const nodeType = createSchemaType("SelectionNodeFindNested", "OBJECT", [], ["name"]);
    const root = createRoot(queryType).addEmbeddable(createRoot(nodeType).addField("name"));

    const nested = root.findField("name");
    expect(nested?.name).toBe("name");
  });
});
