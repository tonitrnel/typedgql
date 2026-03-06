import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { rewriteGeneratedImportsToSrcEntry } from "../helpers/rewrite-generated-imports";

const SCHEMA_FILE = join(
  process.cwd(),
  "tests",
  "relay-style-integration",
  "schema.graphql",
);
const GENERATED_DIR = join(process.cwd(), "__generated-integration-test");
const QUERY_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "query-selection.ts",
);

function normalizeGql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("Runtime + codegen integration", () => {
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

  it("builds connection field queries from generated selections", async () => {
    const mod = (await import(pathToFileURL(QUERY_SELECTION_FILE).href)) as {
      query$: any;
    };

    const selection = mod.query$((q: any) =>
      q
        .users({ first: 1 }, (u: any) => u.totalCount)
        .products({ first: 1 }, (p: any) => p.totalCount),
    );

    expect(normalizeGql(selection.toString())).toBe(
      normalizeGql(`
        {
          users(first: 1) {
            totalCount
          }
          products(first: 1) {
            totalCount
          }
        }
      `),
    );
  });
});
