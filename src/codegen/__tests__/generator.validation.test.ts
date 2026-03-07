import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Generator } from "../generator";

async function runGenerate(
  schema: GraphQLSchema,
  extra?: ConstructorParameters<typeof Generator>[0],
) {
  const dir = await mkdtemp(join(tmpdir(), "typedgql-generator-validation-"));
  try {
    const g = new Generator({
      schemaLoader: async () => schema,
      targetDir: dir,
      ...extra,
    });
    await g.generate();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("Generator validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects reserved field names", async () => {
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        toJSON: { type: GraphQLString },
      },
    });
    const schema = new GraphQLSchema({ query: Query });
    await expect(runGenerate(schema)).rejects.toThrow(
      "it's name is protected by '@ptdgrp/typedgql'",
    );
  });

  it("validates idFieldMap key/field/scalar constraints", async () => {
    const Child = new GraphQLObjectType({
      name: "Child",
      fields: { id: { type: new GraphQLNonNull(GraphQLID) } },
    });
    const User = new GraphQLObjectType({
      name: "User",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        profile: { type: Child },
      },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: { user: { type: User } },
    });
    const schema = new GraphQLSchema({ query: Query, types: [User, Child] });

    await expect(
      runGenerate(schema, { idFieldMap: { MissingType: "id" } }),
    ).rejects.toThrow("contains an illegal key 'MissingType'");
    await expect(
      runGenerate(schema, { idFieldMap: { User: "missing" } }),
    ).rejects.toThrow("there is no field named 'missing'");
    await expect(
      runGenerate(schema, { idFieldMap: { User: "profile" } }),
    ).rejects.toThrow("is not scalar");
  });

  it("rejects conflicting inherited idFieldMap configuration", async () => {
    const A = new GraphQLInterfaceType({
      name: "A",
      fields: {
        ida: { type: GraphQLID },
      },
    });
    const B = new GraphQLInterfaceType({
      name: "B",
      fields: {
        idb: { type: GraphQLID },
      },
    });
    const C = new GraphQLObjectType({
      name: "C",
      interfaces: [A, B],
      fields: {
        ida: { type: GraphQLID },
        idb: { type: GraphQLID },
      },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        c: { type: C },
      },
    });
    const schema = new GraphQLSchema({ query: Query, types: [A, B, C] });

    await expect(
      runGenerate(schema, { idFieldMap: { A: "ida", B: "idb" } }),
    ).rejects.toThrow("Conflict id property configuration");
  });

  it("validates defaultSelectionExcludeMap shape and values", async () => {
    const User = new GraphQLObjectType({
      name: "User",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLString },
      },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: { user: { type: User } },
    });
    const Input = new GraphQLInputObjectType({
      name: "UserInput",
      fields: { name: { type: GraphQLString } },
    });
    const schema = new GraphQLSchema({ query: Query, types: [User, Input] });

    await expect(
      runGenerate(schema, { defaultSelectionExcludeMap: { UserInput: ["name"] as any } }),
    ).rejects.toThrow("contains an illegal key 'UserInput'");
    await expect(
      runGenerate(schema, { defaultSelectionExcludeMap: { User: "name" as any } }),
    ).rejects.toThrow("is not array");
    await expect(
      runGenerate(schema, { defaultSelectionExcludeMap: { User: ["missing"] } }),
    ).rejects.toThrow("is not a field of graphql type 'User'");
  });

  it("does not enforce relay-specific connection/edge shape", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const Node = new GraphQLObjectType({
      name: "NodeEntity",
      fields: { id: { type: GraphQLID } },
    });
    const Edge = new GraphQLObjectType({
      name: "NodeEdge",
      fields: {
        node: { type: Node },
      },
    });
    const Connection = new GraphQLObjectType({
      name: "NodeConnection",
      fields: {
        edges: { type: Edge },
      },
    });
    const QueryWarn = new GraphQLObjectType({
      name: "Query",
      fields: {
        nodes: { type: Connection },
      },
    });
    const schemaWarn = new GraphQLSchema({
      query: QueryWarn,
      types: [Node, Edge, Connection],
    });
    await runGenerate(schemaWarn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("validates scalarTypeDeclarations only allows type/interface declarations", async () => {
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        ping: { type: GraphQLString },
      },
    });
    const schema = new GraphQLSchema({ query: Query });

    await expect(
      runGenerate(schema, {
        scalarTypeDeclarations: `
type JsonValue = string | number;
export type JsonObject = { value: JsonValue };
`,
      }),
    ).resolves.toBeUndefined();

    await expect(
      runGenerate(schema, {
        scalarTypeDeclarations: `export const X = 1;`,
      }),
    ).rejects.toThrow(
      "scalarTypeDeclarations statement[0] must be type/interface declaration",
    );
  });
});
