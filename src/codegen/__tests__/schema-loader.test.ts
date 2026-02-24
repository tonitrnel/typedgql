import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  introspectionFromSchema,
} from "graphql";
import { loadRemoteSchema } from "../schema-loader";

describe("schema-loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests oneOf introspection and preserves isOneOf in schema", async () => {
    const OneOfInput = new GraphQLInputObjectType({
      name: "OneOfInput",
      isOneOf: true,
      fields: {
        id: { type: GraphQLString },
        slug: { type: GraphQLString },
      },
    });

    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        node: {
          type: GraphQLString,
          args: {
            input: { type: new GraphQLNonNull(OneOfInput) },
          },
          resolve: () => "ok",
        },
      },
    });

    const schema = new GraphQLSchema({ query: Query });
    const introspection = introspectionFromSchema(schema);

    const fetchMock = vi.fn(async () => ({
      json: async () => ({ data: introspection }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await loadRemoteSchema("https://example.test/graphql");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = requestInit?.body ?? "";
    expect(body).toContain("isOneOf");

    const loadedType = loaded.getType("OneOfInput");
    expect(loadedType).toBeInstanceOf(GraphQLInputObjectType);
    expect((loadedType as GraphQLInputObjectType).isOneOf).toBe(true);
  });
});
