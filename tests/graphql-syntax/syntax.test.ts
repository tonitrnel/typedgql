import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "graphql";
import { rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { ParameterRef } from "../../dist/index.mjs";

const SCHEMA_FILE = join(process.cwd(), "tests", "graphql-syntax", "schema.graphql");
const GENERATED_DIR = join(process.cwd(), "__generated-graphql-syntax-test");
const QUERY_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "query-selection.ts",
);
const MUTATION_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "mutation-selection.ts",
);

function parseQuery(queryBody: string, variableDefs = ""): void {
  const doc = `query Q${variableDefs} ${queryBody}`;
  parse(doc);
}

function parseMutation(mutationBody: string, variableDefs = ""): void {
  const doc = `mutation M${variableDefs} ${mutationBody}`;
  parse(doc);
}

describe("GraphQL syntax generation (from codegen output)", () => {
  beforeAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });
    const generator = new Generator({
      schemaLoader: () => loadLocalSchema(SCHEMA_FILE),
      targetDir: GENERATED_DIR,
    });
    await generator.generate();
  });

  afterAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });
  });

  it("builds valid nested query selection text", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$.post({ id: "p1" }, (p: any) =>
      p.id.title.author((a: any) => a.id.name),
    );

    expect(() => parseQuery(selection.toString())).not.toThrow();
    expect(selection.toString()).toContain('post(id: "p1")');
    expect(selection.toString()).toContain("author");
  });

  it("builds valid alias/directive/variable output", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$
      .post({ id: ParameterRef.of("postId") }, (p: any) => p.title)
      .$alias("postTitle")
      .$include(true);

    expect(() => parseQuery(selection.toString(), "($postId: ID!)")).not.toThrow();
    expect(selection.toString()).toContain("postTitle: post");
    expect(selection.toString()).toContain("@include");
  });

  it("builds valid complex args with enums/lists and multiple directives", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$
      .$directive("cacheControl", { maxAge: 60 })
      .$directive("auth", { role: "ADMIN" })
      .searchUsers(
        {
          filter: {
            nameContains: "a",
            role: "ADMIN",
            emails: ["a@example.com", "b@example.com"],
          },
          tags: ["new", "hot"],
          role: "USER",
        },
        (u: any) => u.id.name,
      );

    expect(() => parseQuery(selection.toString())).not.toThrow();
    expect(selection.toString()).toContain("role: USER");
    expect(selection.toString()).toContain("tags");
    expect(selection.toString()).toContain("@cacheControl");
    expect(selection.toString()).toContain("@auth");
  });

  it("builds valid named fragment output", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$.viewer((u: any) => u.$on(u.id.name, "UserFields"));
    const doc = `query Q ${selection.toString()}\n${selection.toFragmentString()}`;

    expect(() => parse(doc)).not.toThrow();
    expect(selection.toString()).toContain("... UserFields");
    expect(selection.toFragmentString()).toContain("fragment UserFields on User");
  });

  it("builds valid mutation syntax with variable input", async () => {
    const mod = (await import(pathToFileURL(MUTATION_SELECTION_FILE).href)) as {
      mutation$: any;
    };

    const selection = mod.mutation$
      .$directive("cacheControl", { maxAge: 5 })
      .$directive("auth", { role: "ADMIN" })
      .updateUser(
        {
          input: {
            id: ParameterRef.of("userId"),
            name: "Neo",
            role: "ADMIN",
          },
        },
        (u: any) => u.id.name.email,
      );

    expect(() => parseMutation(selection.toString(), "($userId: ID!)")).not.toThrow();
    expect(selection.toString()).toContain("updateUser");
    expect(selection.toString()).toContain("input");
    expect(selection.toString()).toContain("@cacheControl");
    expect(selection.toString()).toContain("@auth");
  });

  it("builds valid syntax for directive args with variable refs", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$
      .$directive("cacheControl", { maxAge: ParameterRef.of("ttl", "Int!") })
      .$directive("auth", { role: ParameterRef.of("role", "Role!") })
      .viewer((u: any) => u.id);

    expect(() => parseQuery(selection.toString(), "($ttl: Int!, $role: Role!)")).not.toThrow();
    expect(selection.toString()).toContain("@cacheControl");
    expect(selection.toString()).toContain("@auth");
    expect(selection.toString()).toContain("$ttl");
    expect(selection.toString()).toContain("$role");
  });

  it("builds valid syntax when include and skip are both applied on field", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$
      .post({ id: "p1" }, (p: any) => p.title)
      .$include(true)
      .$skip(false);

    expect(() => parseQuery(selection.toString())).not.toThrow();
    expect(selection.toString()).toContain("@include");
    expect(selection.toString()).toContain("@skip");
    expect(selection.toString()).toContain('post(id: "p1")');
  });

  it("builds valid syntax for nested input with multiple variable refs", async () => {
    const mod = (await import(pathToFileURL(MUTATION_SELECTION_FILE).href)) as {
      mutation$: any;
    };

    const selection = mod.mutation$.updateUser(
      {
        input: {
          id: ParameterRef.of("userId"),
          name: ParameterRef.of("name", "String"),
          role: ParameterRef.of("role", "Role"),
        },
      },
      (u: any) => u.id.name,
    );

    expect(() =>
      parseMutation(selection.toString(), "($userId: ID!, $name: String, $role: Role)"),
    ).not.toThrow();
    expect(selection.toString()).toContain("$userId");
    expect(selection.toString()).toContain("$name");
    expect(selection.toString()).toContain("$role");
  });

  it("builds valid syntax for oneOf input literal", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$.lookupUser(
      { input: { email: "neo@example.com" } },
      (u: any) => u.id.email,
    );

    expect(() => parseQuery(selection.toString())).not.toThrow();
    expect(selection.toString()).toContain("lookupUser");
    expect(selection.toString()).toContain('email: "neo@example.com"');
  });

  it("builds valid syntax for oneOf input variable", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$.lookupUser(
      { input: ParameterRef.of("lookupInput", "UserLookupInput!") },
      (u: any) => u.id.name,
    );

    expect(() =>
      parseQuery(selection.toString(), "($lookupInput: UserLookupInput!)"),
    ).not.toThrow();
    expect(selection.toString()).toContain("$lookupInput");
  });
});
