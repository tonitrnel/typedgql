import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLSchema,
} from "graphql";
import { SelectionWriter } from "../writers/selection";
import { TypeHierarchyGraph } from "../type-hierarchy-graph";
import type { SelectionContext } from "../selection-context";
import type { CodegenOptions } from "../options";
import { WriteStream } from "fs";

/** Minimal mock WriteStream that captures written text */
function makeStream(): { stream: WriteStream; getOutput: () => string } {
  let buf = "";
  const stream = {
    write: (chunk: string) => {
      buf += chunk;
      return true;
    },
  } as unknown as WriteStream;
  return { stream, getOutput: () => buf };
}

/** Minimal SelectionContext for testing */
function makeCtx(schema: GraphQLSchema): SelectionContext {
  return {
    schema,
    typeHierarchy: new TypeHierarchyGraph(schema),
    selectionTypes: [],
    entityTypes: new Set(),
    embeddedTypes: new Set(),
    connections: new Map(),
    edgeTypes: new Set(),
    triggerableTypes: new Set(),
    idFieldMap: new Map(),
    typesWithParameterizedField: new Set(),
  };
}

const baseOptions: CodegenOptions = {
  schemaLoader: async () => {
    throw new Error("not used");
  },
};

/** Build a GraphQLObjectType with given scalar field names */
function makeScalarType(typeName: string, fieldNames: string[]) {
  const fields: Record<string, { type: GraphQLNonNull<typeof GraphQLString> }> =
    {};
  for (const f of fieldNames) {
    fields[f] = { type: new GraphQLNonNull(GraphQLString) };
  }
  return new GraphQLObjectType({ name: typeName, fields });
}


describe("Selection 接口生成正确性", () => {
  it("scalar fields generate readonly property accessors", () => {
    const allScalars = ["id", "name", "status", "priority", "createdAt"];

    fc.assert(
      fc.property(fc.subarray(allScalars, { minLength: 1 }), (scalarFields) => {
        const modelType = makeScalarType("TestType", scalarFields);
        const schema = new GraphQLSchema({ query: modelType });
        const ctx = makeCtx(schema);
        const { stream, getOutput } = makeStream();

        const writer = new SelectionWriter(modelType, ctx, stream, baseOptions);
        writer.write();
        const output = getOutput();

        // Each scalar field should appear as a readonly property accessor
        for (const f of scalarFields) {
          expect(output).toContain(`readonly ${f}`);
        }
      }),
    );
  });

  it("association fields generate callback-style method signatures with selection", () => {
    const childType = makeScalarType("ChildType", ["id", "name"]);
    const parentType = new GraphQLObjectType({
      name: "ParentType",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        child: { type: new GraphQLNonNull(childType) },
      },
    });

    const schema = new GraphQLSchema({ query: parentType });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(parentType, ctx, stream, baseOptions);
    writer.write();
    const output = getOutput();

    // Association field "child" should generate a method with selection callback
    expect(output).toContain("child");
    expect(output).toContain("selection");
    // Should NOT generate "readonly child" (that's for scalars only)
    expect(output).not.toContain("readonly child");
  });

  it("list association fields generate ReadonlyArray in return type", () => {
    const itemType = makeScalarType("ItemType", ["id"]);
    const parentType = new GraphQLObjectType({
      name: "ParentType",
      fields: {
        items: {
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(itemType)),
          ),
        },
      },
    });

    const schema = new GraphQLSchema({ query: parentType });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(parentType, ctx, stream, baseOptions);
    writer.write();
    const output = getOutput();

    expect(output).toContain("ReadonlyArray<X>");
  });
});
