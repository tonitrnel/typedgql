import { describe, expect, it } from "vitest";
import {
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
} from "graphql";
import { TypeHierarchyGraph } from "../type-hierarchy-graph";
import { TypeHierarchyWriter } from "../writers/types";
import type { CodegenOptions } from "../options";

class MemoryWriteStream {
  private chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(String(chunk));
    return true;
  }

  toString() {
    return this.chunks.join("");
  }
}

function render(
  schema: GraphQLSchema,
  options?: Partial<CodegenOptions>,
): string {
  const stream = new MemoryWriteStream();
  const writer = new TypeHierarchyWriter(
    schema,
    new TypeHierarchyGraph(schema),
    stream as any,
    {
      schemaLoader: async () => schema,
      ...options,
    },
  );
  writer.write();
  return stream.toString();
}

describe("TypeHierarchyWriter", () => {
  it("writes implementation type, upcast/downcast helpers and WithTypeName", () => {
    const Node = new GraphQLInterfaceType({
      name: "Node",
      fields: { id: { type: GraphQLString } },
    });
    const User = new GraphQLObjectType({
      name: "User",
      interfaces: [Node],
      fields: { id: { type: GraphQLString } },
    });
    const Admin = new GraphQLObjectType({
      name: "Admin",
      interfaces: [Node],
      fields: { id: { type: GraphQLString } },
    });
    const Search = new GraphQLUnionType({
      name: "SearchResult",
      types: [User, Admin],
      resolveType: () => User,
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        node: { type: Node },
        search: { type: Search },
      },
    });
    const schema = new GraphQLSchema({ query: Query, types: [Node, User, Admin, Search] });

    const text = render(schema);
    expect(text).toContain("export type ImplementationType<T>");
    expect(text).toContain("T extends 'Node' ?");
    expect(text).toContain("ImplementationType<'User'>");
    expect(text).toContain("ImplementationType<'Admin'>");
    expect(text).toContain("export function upcastTypes(typeName: string): string[]");
    expect(text).toContain("export function downcastTypes(typeName: string): string[]");
    expect(text).toContain("export type WithTypeName<T, TypeName extends string>");
  });

  it("respects excludedTypes when emitting hierarchy content", () => {
    const Node = new GraphQLInterfaceType({
      name: "Node",
      fields: { id: { type: GraphQLString } },
    });
    const User = new GraphQLObjectType({
      name: "User",
      interfaces: [Node],
      fields: { id: { type: GraphQLString } },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: { node: { type: Node } },
    });
    const schema = new GraphQLSchema({ query: Query, types: [Node, User] });

    const text = render(schema, { excludedTypes: ["User"] });
    expect(text).toContain("T extends 'Node' ?");
    expect(text).not.toContain("ImplementationType<'User'>");
    expect(text).not.toContain("upcastTypes0('User', output)");
  });
});
