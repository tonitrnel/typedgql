import { describe, expect, it } from "vitest";
import {
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLUnionType,
} from "graphql";
import {
  instancePrefix,
  isExcludedTypeName,
  targetTypeOf,
  toKebabCase,
} from "../utils";

describe("codegen utils", () => {
  it("targetTypeOf unwraps list/non-null wrappers and returns composite types", () => {
    const iface = new GraphQLInterfaceType({
      name: "Node",
      fields: { id: { type: GraphQLString } },
    });
    const obj = new GraphQLObjectType({
      name: "User",
      interfaces: [iface],
      fields: { id: { type: GraphQLString } },
    });
    const union = new GraphQLUnionType({
      name: "SearchResult",
      types: [obj],
      resolveType: () => obj,
    });

    expect(targetTypeOf(new GraphQLNonNull(new GraphQLList(obj)))?.name).toBe("User");
    expect(targetTypeOf(new GraphQLList(new GraphQLNonNull(iface)))?.name).toBe("Node");
    expect(targetTypeOf(union)?.name).toBe("SearchResult");
    expect(targetTypeOf(GraphQLString)).toBeUndefined();
  });

  it("instancePrefix and toKebabCase normalize names", () => {
    expect(instancePrefix("QuerySelection")).toBe("querySelection");
    expect(instancePrefix("X")).toBe("x");
    expect(toKebabCase("TaskSelection")).toBe("task-selection");
    expect(toKebabCase("EnumInputMetadata")).toBe("enum-input-metadata");
    expect(toKebabCase("URLValue")).toBe("url-value");
  });

  it("isExcludedTypeName handles undefined and membership checks", () => {
    expect(
      isExcludedTypeName({ schemaLoader: async () => null as any }, undefined),
    ).toBe(false);
    expect(
      isExcludedTypeName(
        { schemaLoader: async () => null as any, excludedTypes: ["User", "Job"] },
        "User",
      ),
    ).toBe(true);
    expect(
      isExcludedTypeName(
        { schemaLoader: async () => null as any, excludedTypes: ["User", "Job"] },
        "Task",
      ),
    ).toBe(false);
  });
});
