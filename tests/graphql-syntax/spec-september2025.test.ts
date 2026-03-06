import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse, print } from "graphql";
import { rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { rewriteGeneratedImportsToSrcEntry } from "../helpers/rewrite-generated-imports";

const SCHEMA_FILE = join(
  process.cwd(),
  "tests",
  "graphql-syntax",
  "schema.graphql",
);
const GENERATED_DIR = join(
  process.cwd(),
  "tests",
  "__generated-graphql-spec-september2025-test",
);
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

function pretty(doc: string): string {
  return print(parse(doc));
}

describe("GraphQL Spec September2025 Tests", () => {
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

  it("example-10b94", async () => {
    await import(pathToFileURL(PAGE_SELECTION_FILE).href);

    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$(
      (q: any) =>
        q.profiles({ handles: ["zuck", "coca-cola"] }, (p: any) =>
          p.handle
            .$on("User", (u: any) => u.friends((f: any) => f.count))
            .$on("Page", (pg: any) => pg.likers((l: any) => l.count)),
        ),
      "inlineFragmentTyping",
    );
    expect(selection.operationName).toBe("inlineFragmentTyping");

    expect(pretty(selection.toString())).toBe(
      pretty(`
        {
          profiles(handles: ["zuck", "coca-cola"]) {
            handle
            __typename
            ... on User {
              friends {
                count
              }
            }
            ... on Page {
              likers {
                count
              }
            }
          }
        }
      `),
    );
  });
});
