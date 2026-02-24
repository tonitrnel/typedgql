import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLNonNull,
} from "graphql";
import { Generator } from "../generator";
import { mkdtemp, readdir, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { rm } from "fs/promises";

/** Build a minimal schema with a Query type and given object type names */
function buildSchema(typeNames: string[]): GraphQLSchema {
  const objectTypes = typeNames.map(
    (name) =>
      new GraphQLObjectType({
        name,
        fields: {
          id: { type: new GraphQLNonNull(GraphQLString) },
        },
      }),
  );

  const queryFields: Record<string, { type: GraphQLObjectType }> = {};
  for (const t of objectTypes) {
    queryFields[t.name.toLowerCase()] = { type: t };
  }

  const queryType = new GraphQLObjectType({
    name: "Query",
    fields: queryFields,
  });

  return new GraphQLSchema({ query: queryType });
}

/**
 * 代码生成输出完整性
 *
 * For any valid GraphQL Schema with at least one Object type,
 * after the generator runs, the output directory should contain:
 * - __generated/ subdirectory
 * - __generated/selections/ directory with a selection file per type and index.ts
 * - __generated/index.ts entry file
 */
describe("代码生成输出完整性", () => {
  it("generated output contains required structure for any valid schema", async () => {
    // Use a fixed set of type names to keep the test deterministic and fast
    const typeNameSets = [
      ["Task"],
      ["Task", "User"],
      ["Task", "User", "Comment"],
    ];

    for (const typeNames of typeNameSets) {
      const tmpDir = await mkdtemp(join(tmpdir(), "typedgql-test-"));
      const targetDir = join(tmpDir, "__generated");

      try {
        const schema = buildSchema(typeNames);
        const generator = new Generator({
          schemaLoader: async () => schema,
          targetDir,
        });

        await generator.generate();

        // 1. __generated/ directory exists
        await expect(access(targetDir)).resolves.toBeUndefined();

        // 2. __generated/selections/ directory exists
        const selectionsDir = join(targetDir, "selections");
        await expect(access(selectionsDir)).resolves.toBeUndefined();

        // 3. selections/index.ts exists
        await expect(
          access(join(selectionsDir, "index.ts")),
        ).resolves.toBeUndefined();

        // 4. Each type has a selection file (kebab-case)
        const selectionFiles = await readdir(selectionsDir);
        for (const typeName of typeNames) {
          const expectedFile = `${typeName.toLowerCase()}-selection.ts`;
          expect(selectionFiles).toContain(expectedFile);
        }
        // Query selection also generated
        expect(selectionFiles).toContain("query-selection.ts");

        // 5. __generated/index.ts exists
        await expect(
          access(join(targetDir, "index.ts")),
        ).resolves.toBeUndefined();

        // 6. type-hierarchy.ts exists (kebab-case)
        await expect(
          access(join(targetDir, "type-hierarchy.ts")),
        ).resolves.toBeUndefined();

        // 7. enum-input-metadata.ts exists (kebab-case)
        await expect(
          access(join(targetDir, "enum-input-metadata.ts")),
        ).resolves.toBeUndefined();
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it("property: for any schema with 1-3 object types, output structure is complete", async () => {
    const validTypeNames = [
      "Alpha",
      "Beta",
      "Gamma",
      "Delta",
      "Epsilon",
      "Zeta",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.subarray(validTypeNames, { minLength: 1, maxLength: 3 }),
        async (typeNames) => {
          const tmpDir = await mkdtemp(join(tmpdir(), "typedgql-pbt-"));
          const targetDir = join(tmpDir, "__generated");

          try {
            const schema = buildSchema(typeNames);
            const generator = new Generator({
              schemaLoader: async () => schema,
              targetDir,
            });

            await generator.generate();

            // __generated/selections/ must exist
            const selectionsDir = join(targetDir, "selections");
            const selectionFiles = await readdir(selectionsDir);

            // index.ts must be present
            expect(selectionFiles).toContain("index.ts");

            // query-selection.ts must be present
            expect(selectionFiles).toContain("query-selection.ts");

            // Each object type must have a kebab-case selection file
            for (const typeName of typeNames) {
              const expectedFile = `${typeName.toLowerCase()}-selection.ts`;
              expect(selectionFiles).toContain(expectedFile);
            }

            // __generated/index.ts must exist
            await expect(
              access(join(targetDir, "index.ts")),
            ).resolves.toBeUndefined();
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
