import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { spawnSync } from "child_process";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { rewriteGeneratedImportsToSrcEntry } from "../helpers/rewrite-generated-imports";

const ROOT_DIR = join(process.cwd(), "tests", "graphql-types");

const SCHEMA_FILE = join(ROOT_DIR, "schema.graphql");
const TSD_ASSERTIONS = "type-assertions.test-d.ts";
const GENERATED_DIR = join(ROOT_DIR, "__gen__");

describe("GraphQL generated type checking", () => {
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

  it("accepts valid calls and rejects invalid calls at compile time", () => {
    const run = spawnSync(
      "pnpm",
      ["exec", "tsd", "tests/graphql-types", "--files", TSD_ASSERTIONS],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    if (run.status !== 0) {
      const output = `${run.stdout}\n${run.stderr}`.trim();
      throw new Error(`Type check failed:\n${output}`);
    }

    expect(run.status).toBe(0);
  });
});
