import { afterEach, describe, expect, it } from "vitest";
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { Generator } from "../generator";

const PACKAGE_DIR = resolve(process.cwd(), "node_modules/@ptdgrp/typedgql");
const PACKAGE_JSON = join(PACKAGE_DIR, "package.json");
const INDEX_TS = join(PACKAGE_DIR, "index.ts");

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function restoreFile(path: string, content: string | undefined) {
  if (content === undefined) {
    await rm(path, { force: true });
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

function makeGenerator(excludedTypes?: string[]) {
  return new Generator({
    schemaLoader: async () => {
      throw new Error("not used");
    },
    targetDir: join(process.cwd(), "__tmp-never-used"),
    excludedTypes,
  });
}

function makeSchema(includeEnumAndInput = true) {
  const Query = new GraphQLObjectType({
    name: "Query",
    fields: {
      ping: { type: GraphQLString },
    },
  });
  const Mutation = new GraphQLObjectType({
    name: "Mutation",
    fields: {
      pong: { type: GraphQLString },
    },
  });
  const Subscription = new GraphQLObjectType({
    name: "Subscription",
    fields: {
      updates: { type: GraphQLString },
    },
  });
  const ExtraTypeList: any[] = [];
  if (includeEnumAndInput) {
    ExtraTypeList.push(
      new GraphQLEnumType({
        name: "Role",
        values: { ADMIN: { value: "ADMIN" } },
      }),
      new GraphQLInputObjectType({
        name: "FilterInput",
        fields: { keyword: { type: GraphQLString } },
      }),
    );
  }
  return new GraphQLSchema({
    query: Query,
    mutation: Mutation,
    subscription: Subscription,
    types: ExtraTypeList,
  });
}

describe("Generator package entrypoint helpers", () => {
  let originalPackageJson: string | undefined;
  let originalIndexTs: string | undefined;

  afterEach(async () => {
    await restoreFile(PACKAGE_JSON, originalPackageJson);
    await restoreFile(INDEX_TS, originalIndexTs);
  });

  it("patchPackageJsonForGeneratedEntrypoint normalizes exports/import mapping", async () => {
    originalPackageJson = await readIfExists(PACKAGE_JSON);
    originalIndexTs = await readIfExists(INDEX_TS);

    await mkdir(PACKAGE_DIR, { recursive: true });
    await writeFile(
      PACKAGE_JSON,
      JSON.stringify({
        name: "@ptdgrp/typedgql",
        exports: { ".": "./legacy.js" },
      }),
      "utf8",
    );

    const generator = makeGenerator();
    await (generator as any).patchPackageJsonForGeneratedEntrypoint();

    const patched = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
    expect(patched.types).toBe("./index.ts");
    expect(patched.exports["."].import.types).toBe("./index.ts");
    expect(patched.exports["."].import.default).toBe("./index.ts");
  });

  it("writePackageIndexCode emits root operation imports and optional enums/inputs exports", () => {
    const schema = makeSchema(true);
    let output = "";
    const stream = {
      write: (chunk: string) => {
        output += chunk;
        return true;
      },
    };

    const generator = makeGenerator();
    (generator as any).writePackageIndexCode(stream, schema, {});

    expect(output).toContain("import { query$ }");
    expect(output).toContain("import { mutation$ }");
    expect(output).toContain("import { subscription$ }");
    expect(output).toContain("query: query$");
    expect(output).toContain("mutation: mutation$");
    expect(output).toContain("subscription: subscription$");
    expect(output).toContain("export * from './__generated/enums';");
    expect(output).toContain("export * from './__generated/inputs';");
    expect(output).toContain("export type * from './__generated/selections';");
    expect(output).toContain("export type * from './__generated/type-hierarchy';");
  });

  it("writePackageEntrypoint writes index.ts and respects excluded enums/inputs", async () => {
    originalPackageJson = await readIfExists(PACKAGE_JSON);
    originalIndexTs = await readIfExists(INDEX_TS);

    await mkdir(PACKAGE_DIR, { recursive: true });
    await writeFile(PACKAGE_JSON, JSON.stringify({ name: "@ptdgrp/typedgql" }), "utf8");

    const schema = makeSchema(true);
    const generator = makeGenerator(["Role", "FilterInput"]);
    await (generator as any).writePackageEntrypoint(schema, {});

    const indexText = await readFile(INDEX_TS, "utf8");
    expect(indexText).toContain("export * from './__generated/index';");
    expect(indexText).toContain("export { query$ };");
    expect(indexText).toContain("export { mutation$ };");
    expect(indexText).toContain("export { subscription$ };");
    expect(indexText).toContain("export type * from './__generated/selections';");
    expect(indexText).not.toContain("export * from './__generated/enums';");
    expect(indexText).not.toContain("export * from './__generated/inputs';");
  });
});
