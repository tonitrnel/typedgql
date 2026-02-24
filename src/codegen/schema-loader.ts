import { readFile } from "fs/promises";
import { GraphQLSchema } from "graphql";
import { buildSchema, getIntrospectionQuery, buildClientSchema } from "graphql";

export async function loadRemoteSchema(
  endpoint: string,
  headers?: { [key: string]: string },
): Promise<GraphQLSchema> {
  const body = JSON.stringify({
    query: getIntrospectionQuery({ oneOf: true }),
  });
  const response = await fetch(endpoint, {
    method: "POST",
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
  });
  const { data, errors } = (await response.json()) as {
    data: Parameters<typeof buildClientSchema>[0];
    errors?: unknown;
  };
  if (errors !== undefined) {
    throw new Error(JSON.stringify(errors));
  }
  return buildClientSchema(data);
}

export async function loadLocalSchema(
  location: string,
): Promise<GraphQLSchema> {
  const sdl = await readFile(location, { encoding: "utf8" });
  return buildSchema(sdl);
}
