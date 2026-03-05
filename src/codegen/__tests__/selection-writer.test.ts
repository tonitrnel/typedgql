import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLSchema,
  GraphQLFieldMap,
  GraphQLType,
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
    triggerableTypes: new Set(),
    idFieldMap: new Map(),
    typesWithParameterizedField: new Set(),
  };
}

function makeCtxWithOverrides(
  schema: GraphQLSchema,
  overrides: Partial<SelectionContext>,
): SelectionContext {
  return {
    ...makeCtx(schema),
    ...overrides,
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

  it("field description and deprecation are emitted as JSDoc", () => {
    const modelType = new GraphQLObjectType({
      name: "DocType",
      fields: {
        legacyName: {
          type: new GraphQLNonNull(GraphQLString),
          description: "Primary name\nshown to users",
          deprecationReason: "Use profileName */ instead",
        },
      },
    });

    const schema = new GraphQLSchema({ query: modelType });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(modelType, ctx, stream, baseOptions);
    writer.write();
    const output = getOutput();

    expect(output).toContain("/**");
    expect(output).toContain(" * Primary name");
    expect(output).toContain(" * shown to users");
    expect(output).toContain(" * @deprecated Use profileName *\\/ instead");
  });

  it("union selection only includes shared fields", () => {
    const A = new GraphQLObjectType({
      name: "A",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        onlyA: { type: new GraphQLNonNull(GraphQLString) },
      },
    });
    const B = new GraphQLObjectType({
      name: "B",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        onlyB: { type: new GraphQLNonNull(GraphQLString) },
      },
    });
    const U = new GraphQLUnionType({
      name: "SearchResult",
      types: [A, B],
      resolveType: () => A,
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        result: { type: U },
      },
    });
    const schema = new GraphQLSchema({ query: Query, types: [A, B, U] });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(U, ctx, stream, baseOptions);
    writer.write();
    const output = getOutput();

    expect(output).toContain('readonly id');
    expect(output).not.toContain('readonly onlyA');
    expect(output).not.toContain('readonly onlyB');
  });

  it("excludedTypes filters out association fields from generated selection", () => {
    const Hidden = makeScalarType("HiddenType", ["id"]);
    const Parent = new GraphQLObjectType({
      name: "ParentWithExcluded",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        hidden: { type: Hidden },
      },
    });
    const schema = new GraphQLSchema({ query: Parent, types: [Hidden] });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(Parent, ctx, stream, {
      ...baseOptions,
      excludedTypes: ["HiddenType"],
    });
    writer.write();
    const output = getOutput();

    expect(output).toContain('readonly id');
    expect(output).not.toContain('hidden(');
  });

  it("schema descriptor includes upcast type references for inherited object types", () => {
    const Node = new GraphQLInterfaceType({
      name: "Node",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
    });
    const User = new GraphQLObjectType({
      name: "UserWithInterface",
      interfaces: [Node],
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: GraphQLString },
      },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        user: { type: User },
      },
    });
    const schema = new GraphQLSchema({ query: Query, types: [Node, User] });
    const ctx = makeCtx(schema);
    const { stream, getOutput } = makeStream();

    const writer = new SelectionWriter(User, ctx, stream, baseOptions);
    writer.write();
    const output = getOutput();

    expect(output).toContain('resolveRegisteredSchemaType("Node")!');
  });

  it("importingBehavior returns self/same_dir/other_dir branches", () => {
    const modelType = makeScalarType("BehaviorType", ["id"]);
    const schema = new GraphQLSchema({ query: modelType });
    const ctx = makeCtx(schema);
    const { stream } = makeStream();

    class SelectionWriterProbe extends SelectionWriter {
      behavior(type: GraphQLType) {
        return this.importingBehavior(type as any);
      }
    }

    const writer = new SelectionWriterProbe(modelType, ctx, stream, baseOptions);
    const sameDirType = new GraphQLObjectType({
      name: "AnotherObject",
      fields: {} as GraphQLFieldMap<any, any>,
    });
    const otherDirType = new GraphQLUnionType({
      name: "UnionBehavior",
      types: [modelType],
      resolveType: () => modelType,
    });

    expect(writer.behavior(modelType)).toBe("self");
    expect(writer.behavior(sameDirType)).toBe("same_dir");
    expect(writer.behavior(otherDirType)).toBe("other_dir");
  });
});
