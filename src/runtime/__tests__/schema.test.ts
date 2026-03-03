import { describe, expect, it } from "vitest";
import {
  createSchemaType,
  registerSchemaTypeFactory,
  resolveRegisteredSchemaType,
} from "../schema";

describe("schema runtime", () => {
  it("builds scalar and association field flags correctly", () => {
    const type = createSchemaType("SchemaFlagType", "OBJECT", [], [
      "id",
      { name: "children", category: "LIST", targetTypeName: "SchemaFlagType" },
      {
        name: "findById",
        category: "REFERENCE",
        targetTypeName: "SchemaFlagType",
        argGraphQLTypeMap: { id: "ID!" },
      },
    ]);

    const id = type.fields.get("id")!;
    expect(id.isAssociation).toBe(false);
    expect(id.isPlural).toBe(false);
    expect(id.isFunction).toBe(false);

    const children = type.fields.get("children")!;
    expect(children.isAssociation).toBe(true);
    expect(children.isPlural).toBe(true);
    expect(children.isFunction).toBe(true);

    const findById = type.fields.get("findById")!;
    expect(findById.isAssociation).toBe(true);
    expect(findById.isFunction).toBe(true);
    expect(findById.argGraphQLTypeMap.get("id")).toBe("ID!");
  });

  it("merges inherited fields lazily", () => {
    const base = createSchemaType("SchemaBaseType", "OBJECT", [], ["id"]);
    const derived = createSchemaType("SchemaDerivedType", "OBJECT", [base], [
      "name",
    ]);

    expect(derived.ownFields.has("name")).toBe(true);
    expect(derived.ownFields.has("id")).toBe(false);
    expect(derived.fields.has("id")).toBe(true);
    expect(derived.fields.has("name")).toBe(true);
  });

  it("validates connection/edge shape rules", () => {
    expect(() =>
      createSchemaType("BadConnectionNoEdges", "CONNECTION", [], []),
    ).toThrow('Type "BadConnectionNoEdges": CONNECTION must have an "edges" field');

    expect(() =>
      createSchemaType("BadConnectionEdgeType", "CONNECTION", [], [
        { name: "edges", category: "SCALAR" },
      ]),
    ).toThrow('Type "BadConnectionEdgeType": CONNECTION "edges" must be LIST');

    expect(() =>
      createSchemaType("BadEdgeNoNode", "EDGE", [], [
        { name: "cursor", category: "SCALAR" },
      ]),
    ).toThrow('Type "BadEdgeNoNode": EDGE must have a "node" field');

    expect(() =>
      createSchemaType("BadEdgeNodeType", "EDGE", [], [
        { name: "node", category: "SCALAR" },
      ]),
    ).toThrow('Type "BadEdgeNodeType": EDGE "node" must be REFERENCE');

    expect(() =>
      createSchemaType("BadEdgeCursorType", "EDGE", [], [
        { name: "node", category: "REFERENCE", targetTypeName: "X" },
        { name: "cursor", category: "LIST", targetTypeName: "X" },
      ]),
    ).toThrow('Type "BadEdgeCursorType": EDGE "cursor" must be SCALAR');

    const superType = createSchemaType("SchemaSuperType", "OBJECT", [], ["id"]);
    expect(() =>
      createSchemaType("BadConnectionWithSuper", "CONNECTION", [superType], [
        { name: "edges", category: "LIST", targetTypeName: "SchemaEdgeType" },
      ]),
    ).toThrow('Type "BadConnectionWithSuper": CONNECTION cannot have super types');
    expect(() =>
      createSchemaType("BadEdgeWithSuper", "EDGE", [superType], [
        { name: "node", category: "REFERENCE", targetTypeName: "SchemaNodeType" },
      ]),
    ).toThrow('Type "BadEdgeWithSuper": EDGE cannot have super types');
  });

  it("resolves lazy registered factories and prevents circular resolution", () => {
    const created = createSchemaType("SchemaFactoryType", "OBJECT", [], [
      "id",
    ]);

    registerSchemaTypeFactory("SchemaFactoryType", () => created);
    const resolved = resolveRegisteredSchemaType("SchemaFactoryType");
    expect(resolved).toBe(created);

    const mismatched = createSchemaType("SchemaFactoryMismatchedActual", "OBJECT", [], [
      "id",
    ]);
    registerSchemaTypeFactory("SchemaFactoryMismatchedRequested", () => mismatched);
    expect(resolveRegisteredSchemaType("SchemaFactoryMismatchedRequested")).toBeUndefined();

    registerSchemaTypeFactory("SchemaCircular", () => {
      resolveRegisteredSchemaType("SchemaCircular");
      return created;
    });
    expect(() => resolveRegisteredSchemaType("SchemaCircular")).toThrow(
      'Circular schema factory resolution detected for "SchemaCircular"',
    );
  });

  it("prefers schema type with more own fields when re-registering same name", () => {
    createSchemaType("SchemaReplaceType", "OBJECT", [], ["id"]);
    createSchemaType("SchemaReplaceType", "OBJECT", [], ["id", "name"]);

    const resolved = resolveRegisteredSchemaType("SchemaReplaceType");
    expect(resolved?.ownFields.size).toBe(2);
    expect(resolved?.fields.has("name")).toBe(true);
  });
});
