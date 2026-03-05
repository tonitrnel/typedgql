import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  introspectionFromSchema,
} from "graphql";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadLocalSchema, loadRemoteSchema } from "../schema-loader";

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

  it("forwards custom headers and throws when remote schema has errors", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ errors: [{ message: "boom" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadRemoteSchema("https://example.test/graphql", { Authorization: "Bearer token" }),
    ).rejects.toThrow('[{"message":"boom"}]');

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
      method?: string;
    };
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers?.Authorization).toBe("Bearer token");
    expect(requestInit.headers?.["Content-Type"]).toBe("application/json");
  });

  it("loads local SDL schema from file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "typedgql-schema-loader-"));
    const schemaPath = join(dir, "schema.graphql");
    await writeFile(schemaPath, "type Query { hello: String }", "utf8");

    const schema = await loadLocalSchema(schemaPath);
    expect(schema.getQueryType()?.name).toBe("Query");
    expect(schema.getQueryType()?.getFields().hello).toBeDefined();

    await rm(dir, { recursive: true, force: true });
  });
});
