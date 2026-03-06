import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse, print } from "graphql";
import { rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { ParameterRef } from "../../src/index";
import { rewriteGeneratedImportsToSrcEntry } from "../helpers/rewrite-generated-imports";

const SCHEMA_FILE = join(
  process.cwd(),
  "tests",
  "graphql-syntax",
  "schema.graphql",
);
const GENERATED_DIR = join(process.cwd(), "tests", "__generated-graphql-syntax-test");
const GENERATED_INDEX_FILE = join(GENERATED_DIR, "index.ts");
const QUERY_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "query-selection.ts",
);
const PAGE_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "page-selection.ts",
);
const MUTATION_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "mutation-selection.ts",
);
const SUBSCRIPTION_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "subscription-selection.ts",
);

function parseQuery(queryBody: string, variableDefs = ""): void {
  const doc = `query Q${variableDefs} ${queryBody}`;
  parse(doc);
}

function parseMutation(mutationBody: string, variableDefs = ""): void {
  const doc = `mutation M${variableDefs} ${mutationBody}`;
  parse(doc);
}

function parseSubscription(subscriptionBody: string, variableDefs = ""): void {
  const doc = `subscription S${variableDefs} ${subscriptionBody}`;
  parse(doc);
}

function pretty(doc: string): string {
  return print(parse(doc));
}

function queryDoc(selection: any, variableDefs = ""): string {
  return pretty(
    `query Q${variableDefs} ${selection.toString()}\n${selection.toFragmentString()}`,
  );
}

function mutationDoc(selection: any, variableDefs = ""): string {
  return pretty(
    `mutation M${variableDefs} ${selection.toString()}\n${selection.toFragmentString()}`,
  );
}

function subscriptionDoc(selection: any, variableDefs = ""): string {
  return pretty(
    `subscription S${variableDefs} ${selection.toString()}\n${selection.toFragmentString()}`,
  );
}

describe("GraphQL syntax generation (from codegen output)", () => {
  beforeAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });
    const generator = new Generator({
      schemaLoader: () => loadLocalSchema(SCHEMA_FILE),
      targetDir: GENERATED_DIR,
    });
    await generator.generate();
    await rewriteGeneratedImportsToSrcEntry(GENERATED_DIR);
  });

  afterAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });
  });

  it("builds valid nested query selection text", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$(
      (q: any) =>
        q.post({ id: "p1" }, (p: any) =>
          p.id.title.author((a: any) => a.id.name),
        ),
      "GetPost",
    );

    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          post(id: "p1") {
            id
            title
            author {
              id
              name
            }
          }
        }
      `),
    );
  });

  it("builds valid alias/directive/variable output", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q
        .post({ id: ParameterRef.of("postId") }, (p: any) => p.title)
        .$alias("postTitle")
        .$include(true),
    );

    expect(queryDoc(selection, "($postId: ID!)")).toBe(
      pretty(`
        query Q($postId: ID!) {
          postTitle: post(id: $postId) @include(if: true) {
            title
          }
        }
      `),
    );
  });

  it("builds valid complex args with enums/lists and multiple directives", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q
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
        ),
    );

    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q @auth(role: "ADMIN") @cacheControl(maxAge: 60) {
          searchUsers(
            filter: {
              nameContains: "a"
              role: ADMIN
              emails: ["a@example.com", "b@example.com"]
            }
            tags: ["new", "hot"]
            role: USER
          ) {
            id
            name
          }
        }
      `),
    );
  });

  it("builds valid named fragment output", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };
    const runtimeMod = (await import(
      pathToFileURL(GENERATED_INDEX_FILE).href
    )) as {
      fragment$: any;
    };

    const userFields = runtimeMod.fragment$(
      "User",
      (u: any) => u.id.name,
      "UserFields",
    );
    const selection = mod.query$((q: any) =>
      q.viewer((u: any) => u.$use(userFields)),
    );
    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          viewer {
            ...UserFields
          }
        }

        fragment UserFields on User {
          id
          name
        }
      `),
    );
  });

  it("builds valid mutation syntax with variable input", async () => {
    const mod = (await import(pathToFileURL(MUTATION_SELECTION_FILE).href)) as {
      mutation$: any;
    };

    const selection = mod.mutation$((m: any) =>
      m
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
        ),
    );

    expect(mutationDoc(selection, "($userId: ID!)")).toBe(
      pretty(`
        mutation M($userId: ID!) @auth(role: "ADMIN") @cacheControl(maxAge: 5) {
          updateUser(input: { id: $userId, name: "Neo", role: ADMIN }) {
            id
            name
            email
          }
        }
      `),
    );
  });

  it("builds valid syntax for directive args with variable refs", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q
        .$directive("cacheControl", { maxAge: ParameterRef.of("ttl", "Int!") })
        .$directive("auth", { role: ParameterRef.of("role", "Role!") })
        .viewer((u: any) => u.id),
    );

    expect(queryDoc(selection, "($ttl: Int!, $role: Role!)")).toBe(
      pretty(`
        query Q($ttl: Int!, $role: Role!) @auth(role: $role) @cacheControl(maxAge: $ttl) {
          viewer {
            id
          }
        }
      `),
    );
  });

  it("builds valid syntax when include and skip are both applied on field", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q
        .post({ id: "p1" }, (p: any) => p.title)
        .$include(true)
        .$skip(false),
    );

    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          post(id: "p1") @include(if: true) @skip(if: false) {
            title
          }
        }
      `),
    );
  });

  it("builds valid syntax for nested input with multiple variable refs", async () => {
    const mod = (await import(pathToFileURL(MUTATION_SELECTION_FILE).href)) as {
      mutation$: any;
    };

    const selection = mod.mutation$((m: any) =>
      m.updateUser(
        {
          input: {
            id: ParameterRef.of("userId"),
            name: ParameterRef.of("name", "String"),
            role: ParameterRef.of("role", "Role"),
          },
        },
        (u: any) => u.id.name,
      ),
    );

    expect(
      mutationDoc(selection, "($userId: ID!, $name: String, $role: Role)"),
    ).toBe(
      pretty(`
        mutation M($userId: ID!, $name: String, $role: Role) {
          updateUser(input: { id: $userId, name: $name, role: $role }) {
            id
            name
          }
        }
      `),
    );
  });

  it("builds valid syntax for oneOf input literal", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q.lookupUser(
        { input: { email: "neo@example.com" } },
        (u: any) => u.id.email,
      ),
    );

    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          lookupUser(input: { email: "neo@example.com" }) {
            id
            email
          }
        }
      `),
    );
  });

  it("builds valid syntax for oneOf input variable", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q.lookupUser(
        { input: ParameterRef.of("lookupInput", "UserLookupInput!") },
        (u: any) => u.id.name,
      ),
    );

    expect(queryDoc(selection, "($lookupInput: UserLookupInput!)")).toBe(
      pretty(`
        query Q($lookupInput: UserLookupInput!) {
          lookupUser(input: $lookupInput) {
            id
            name
          }
        }
      `),
    );
  });

  it("builds valid syntax with fragment$ + $use", async () => {
    const mod = (await import(pathToFileURL(GENERATED_INDEX_FILE).href)) as {
      fragment$: any;
    };
    const queryMod = (await import(
      pathToFileURL(QUERY_SELECTION_FILE).href
    )) as {
      query$: any;
    };

    const userBase = mod.fragment$("User", (u: any) => u.id.name, "UserBase");
    const selection = queryMod.query$((q: any) =>
      q.viewer((u: any) => u.$use(userBase)),
    );
    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          viewer {
            ...UserBase
          }
        }

        fragment UserBase on User {
          id
          name
        }
      `),
    );
  });

  it("is equivalent to nested named fragment GraphQL via print(parse())", async () => {
    const runtimeMod = (await import(
      pathToFileURL(GENERATED_INDEX_FILE).href
    )) as {
      fragment$: any;
    };
    const queryMod = (await import(
      pathToFileURL(QUERY_SELECTION_FILE).href
    )) as {
      query$: any;
    };

    const standardProfilePic = runtimeMod.fragment$(
      "User",
      (u: any) => u.email,
      "standardProfilePic",
    );
    const friendFields = runtimeMod.fragment$(
      "User",
      (u: any) => u.id.name.$use(standardProfilePic),
      "friendFields",
    );

    const selection = queryMod.query$(
      (q: any) =>
        q
          .viewer((u: any) => u.$use(friendFields))
          .lookupUser({ input: { id: "u1" } }, (u: any) =>
            u.$use(friendFields),
          ),
      "withNestedFragments",
    );

    const actual = pretty(
      `${selection.toString()}\n${selection.toFragmentString()}`,
    );
    expect(selection.operationName).toBe("withNestedFragments");
    const expected = pretty(`
        {
          viewer {
            ...friendFields
          }
          lookupUser(input: { id: "u1" }) {
            ...friendFields
          }
        }

        fragment friendFields on User {
          id
          name
          ...standardProfilePic
        }

        fragment standardProfilePic on User {
          email
        }
      `);

    expect(actual).toBe(expected);
  });

  it("builds valid syntax for interface fields from generated selections", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q.node({ id: "n1" }, (n: any) => n.id),
    );

    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          node(id: "n1") {
            id
          }
        }
      `),
    );
  });

  it("builds valid named fragment syntax on interface selection", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };
    const runtimeMod = (await import(
      pathToFileURL(GENERATED_INDEX_FILE).href
    )) as {
      fragment$: any;
    };

    const nodeFields = runtimeMod.fragment$(
      "Node",
      (n: any) => n.id,
      "NodeFields",
    );
    const selection = mod.query$((q: any) =>
      q.node({ id: "n1" }, (n: any) => n.$use(nodeFields)),
    );
    expect(queryDoc(selection)).toBe(
      pretty(`
        query Q {
          node(id: "n1") {
            ...NodeFields
          }
        }

        fragment NodeFields on Node {
          id
        }
      `),
    );
  });

  it("builds valid subscription syntax from generated root selection", async () => {
    const mod = (await import(
      pathToFileURL(SUBSCRIPTION_SELECTION_FILE).href
    )) as {
      subscription$: any;
    };

    const selection = mod.subscription$((s: any) =>
      s
        .postUpdated({ id: "p1" }, (p: any) => p.id.title)
        .$directive("cacheControl", { maxAge: 3 }),
    );

    expect(subscriptionDoc(selection)).toBe(
      pretty(`
        subscription S {
          postUpdated(id: "p1") @cacheControl(maxAge: 3) {
            id
            title
          }
        }
      `),
    );
  });

  it("builds valid subscription syntax with parameter refs", async () => {
    const mod = (await import(
      pathToFileURL(SUBSCRIPTION_SELECTION_FILE).href
    )) as {
      subscription$: any;
    };

    const selection = mod.subscription$((s: any) =>
      s.postUpdated({ id: ParameterRef.of("postId") }, (p: any) =>
        p.id.author((a: any) => a.id.name),
      ),
    );

    expect(subscriptionDoc(selection, "($postId: ID!)")).toBe(
      pretty(`
        subscription S($postId: ID!) {
          postUpdated(id: $postId) {
            id
            author {
              id
              name
            }
          }
        }
      `),
    );
  });
});
