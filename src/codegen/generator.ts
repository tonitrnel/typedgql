import {
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import type { CodegenOptions } from "./options";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { createWriteStream, WriteStream } from "fs";
import { join, resolve } from "path";
import { SelectionWriter } from "./writers/selection";
import { EnumWriter } from "./writers/enum";
import { InputWriter } from "./writers/input";
import { CommonTypesWriter } from "./writers/types";
import { TypeHierarchyGraph } from "./type-hierarchy-graph";
import { Connection, SelectionContext } from "./selection-context";
import { EnumInputMetadataWriter } from "./writers/enum-input-metadata";
import { isExcludedTypeName, targetTypeOf, toKebabCase } from "./utils";
import ASYNC_CODE from "./templates/async-runtime.template?raw";

/** Default output directory: node_modules/@ptdgrp/typedgql/__generated */
const DEFAULT_TARGET_DIR = resolve(
  process.cwd(),
  "node_modules/@ptdgrp/typedgql/__generated",
);

/** Parent package dir: node_modules/@ptdgrp/typedgql */
const PACKAGE_DIR = resolve(process.cwd(), "node_modules/@ptdgrp/typedgql");

/** Field names reserved by the runtime SelectionNode implementation. */
const RESERVED_FIELDS = new Set([
  "constructor",
  "addField",
  "removeField",
  "addEmbeddable",
  "addDirective",
  "fieldMap",
  "directiveMap",
  "findField",
  "findFieldsByName",
  "findFieldByName",
  "schemaType",
  "variableTypeMap",
  "toString",
  "toJSON",
  "toFragmentString",
  " $supressWarnings",
]);

export class Generator {
  constructor(protected options: CodegenOptions) { }

  /** Resolved output directory (uses default if not configured) */
  private get targetDir(): string {
    return this.options.targetDir ?? DEFAULT_TARGET_DIR;
  }

  async generate() {
    const schema = await this.options.schemaLoader();
    this.validateSchema(schema);

    await rm(this.targetDir, { recursive: true, force: true });
    await mkdir(this.targetDir, { recursive: true });

    const typeHierarchy = new TypeHierarchyGraph(schema);
    const selectionTypes: Array<
      GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType
    > = [];
    const connections = new Map<GraphQLType, Connection>();
    const edgeTypes = new Set<GraphQLType>();
    const inputTypes: GraphQLInputObjectType[] = [];
    const enumTypes: GraphQLEnumType[] = [];

    const typeMap = schema.getTypeMap();
    for (const typeName in typeMap) {
      if (typeName.startsWith("__")) continue;

      const type = typeMap[typeName]!;
      if (
        type instanceof GraphQLObjectType ||
        type instanceof GraphQLInterfaceType
      ) {
        const tuple = parseConnectionType(type);
        if (tuple) {
          connections.set(tuple[0], {
            edgeType: tuple[1],
            nodeType: tuple[2],
          });
          edgeTypes.add(tuple[1]);
        }
      }
      if (isExcludedTypeName(this.options, type.name)) continue;

      if (
        type instanceof GraphQLObjectType ||
        type instanceof GraphQLInterfaceType ||
        type instanceof GraphQLUnionType
      ) {
        selectionTypes.push(type);
      } else if (type instanceof GraphQLInputObjectType) {
        inputTypes.push(type);
      } else if (type instanceof GraphQLEnumType) {
        enumTypes.push(type);
      }
    }

    const configuredIdFieldMap = this.options.idFieldMap ?? {};
    const entityTypes = new Set<GraphQLType>();
    const embeddedTypes = new Set<GraphQLType>();
    const idFieldMap = new Map<
      GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
      GraphQLField<any, any>
    >();
    const triggerableTypes = new Set<GraphQLType>();
    const typesWithParameterizedField = new Set<
      GraphQLObjectType | GraphQLInterfaceType
    >();

    for (const selectionType of selectionTypes) {
      if (connections.has(selectionType) || edgeTypes.has(selectionType)) continue;
      if (
        !(selectionType instanceof GraphQLObjectType) &&
        !(selectionType instanceof GraphQLInterfaceType)
      ) continue;

      const fieldMap = selectionType.getFields();

      if (selectionType.name === "Query") {
        if (Object.keys(fieldMap).length !== 0) {
          triggerableTypes.add(selectionType);
        }
      } else {
        let idFieldName = configuredIdFieldMap[selectionType.name];
        if (idFieldName === undefined) {
          let configuredUpcastType:
            | GraphQLObjectType
            | GraphQLInterfaceType
            | GraphQLUnionType
            | undefined = undefined;
          typeHierarchy.visitUpcastTypesRecursively(
            selectionType,
            (upcastType) => {
              const newIdFieldName = configuredIdFieldMap[upcastType.name];
              if (idFieldName === undefined) {
                configuredUpcastType = upcastType;
                idFieldName = newIdFieldName;
              } else if (idFieldName !== newIdFieldName) {
                throw new Error(
                  `Conflict id property configuration: ${configuredUpcastType!.name}.${idFieldName} and ${selectionType.name}.${newIdFieldName}`,
                );
              }
            },
          );
        }
        const idField = fieldMap[idFieldName ?? "id"];
        if (idField != null) {
          idFieldMap.set(selectionType, idField);
          entityTypes.add(selectionType);
          if (Object.keys(fieldMap).length !== 1) {
            triggerableTypes.add(selectionType);
          }
        } else {
          embeddedTypes.add(selectionType);
        }
      }

      for (const fieldName in fieldMap) {
        if (fieldMap[fieldName]!.args.length !== 0) {
          typesWithParameterizedField.add(selectionType);
          break;
        }
      }
    }

    const ctx: SelectionContext = {
      schema,
      typeHierarchy,
      selectionTypes,
      entityTypes,
      embeddedTypes,
      connections,
      edgeTypes,
      triggerableTypes,
      idFieldMap,
      typesWithParameterizedField,
    };

    const promises: Promise<any>[] = [];

    if (selectionTypes.length !== 0) {
      await mkdir(join(this.targetDir, "selections"), { recursive: true });
      promises.push(this.generateSelectionTypes(ctx));
    }
    if (inputTypes.length !== 0) {
      await mkdir(join(this.targetDir, "inputs"), { recursive: true });
      promises.push(this.generateInputTypes(inputTypes));
    }
    if (enumTypes.length !== 0) {
      await mkdir(join(this.targetDir, "enums"), { recursive: true });
      promises.push(this.generateEnumTypes(enumTypes));
    }

    promises.push(this.generateCommonTypes(schema, typeHierarchy));
    promises.push(this.generateEnumInputMetadata(schema));
    promises.push(this.generateAsyncRuntime());
    promises.push(this.writeIndex(schema));

    await Promise.all(promises);

    // Post-generation: create package.json and index.ts in node_modules/@ptdgrp/typedgql/
    // only when using the default Prisma-style output path
    if (this.options.targetDir === undefined) {
      await this.writePackageEntrypoint(schema, ctx);
    }
  }

  private createSelectionWriter(
    modelType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    ctx: SelectionContext,
    stream: WriteStream,
    options: CodegenOptions,
  ): SelectionWriter {
    return new SelectionWriter(modelType, ctx, stream, options);
  }

  private additionalExportedTypeNamesForSelection(
    _modelType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    _ctx: SelectionContext,
  ): ReadonlyArray<string> {
    return [];
  }

  private async generateSelectionTypes(ctx: SelectionContext) {
    const dir = join(this.targetDir, "selections");
    const emptySelectionNameMap = new Map<GraphQLType, string | undefined>();
    const defaultSelectionNameMap = new Map<GraphQLType, string>();
    const suffix = this.options?.selectionSuffix ?? "Selection";

    const promises = ctx.selectionTypes.map(async (type) => {
      const selectionTypeName = `${type.name}${suffix}`;
      const stream = createStream(join(dir, `${toKebabCase(selectionTypeName)}.ts`));
      const writer = this.createSelectionWriter(type, ctx, stream, this.options);
      emptySelectionNameMap.set(type, writer.emptySelectionName);
      if (writer.defaultSelectionName !== undefined) {
        defaultSelectionNameMap.set(type, writer.defaultSelectionName);
      }
      writer.write();
      await endStream(stream);
    });

    await Promise.all([
      ...promises,
      (async () => {
        const stream = createStream(join(dir, "index.ts"));
        for (const type of ctx.selectionTypes) {
          const selectionTypeName = `${type.name}${suffix}`;
          const selectionFileName = toKebabCase(selectionTypeName);
          const typeExports = [
            selectionTypeName,
            (type instanceof GraphQLObjectType ||
              type instanceof GraphQLInterfaceType) &&
              ctx.typesWithParameterizedField.has(type)
              ? `${type.name}Args`
              : undefined,
            ...this.additionalExportedTypeNamesForSelection(type, ctx),
          ]
            .filter(Boolean)
            .join(", ");

          stream.write(`export type {${typeExports}} from './${selectionFileName}';\n`);

          const defaultSelectionName = defaultSelectionNameMap.get(type);
          const valueExports = [
            emptySelectionNameMap.get(type),
            defaultSelectionName,
          ]
            .filter(Boolean)
            .join(", ");

          if (valueExports.length !== 0) {
            stream.write(`export {${valueExports}} from './${selectionFileName}';\n`);
          }
        }
        await stream.end();
      })(),
    ]);
  }

  private async generateInputTypes(inputTypes: GraphQLInputObjectType[]) {
    const dir = join(this.targetDir, "inputs");
    const promises = inputTypes.map(async (type) => {
      const stream = createStream(join(dir, `${toKebabCase(type.name)}.ts`));
      new InputWriter(type, stream, this.options).write();
      await stream.end();
    });
    await Promise.all([...promises, this.writeSimpleIndex(dir, inputTypes)]);
  }

  private async generateEnumTypes(enumTypes: GraphQLEnumType[]) {
    const dir = join(this.targetDir, "enums");
    const promises = enumTypes.map(async (type) => {
      const stream = createStream(join(dir, `${toKebabCase(type.name)}.ts`));
      new EnumWriter(type, stream, this.options).write();
      await stream.end();
    });
    await Promise.all([
      ...promises,
      this.writeSimpleIndex(dir, enumTypes, true),
    ]);
  }

  private async generateCommonTypes(
    schema: GraphQLSchema,
    typeHierarchy: TypeHierarchyGraph,
  ) {
    const stream = createStream(join(this.targetDir, "type-hierarchy.ts"));
    new CommonTypesWriter(schema, typeHierarchy, stream, this.options).write();
    await endStream(stream);
  }

  private async generateEnumInputMetadata(schema: GraphQLSchema) {
    const stream = createStream(join(this.targetDir, "enum-input-metadata.ts"));
    new EnumInputMetadataWriter(schema, stream, this.options).write();
    await endStream(stream);
  }

  private async writeSimpleIndex(
    dir: string,
    types: GraphQLNamedType[],
    typeOnly = true,
  ) {
    const stream = createStream(join(dir, "index.ts"));
    const keyword = typeOnly ? "export type" : "export";
    for (const type of types) {
      stream.write(`${keyword} {${type.name}} from './${toKebabCase(type.name)}';\n`);
    }
    await stream.end();
  }

  private async generateAsyncRuntime() {
    const stream = createStream(join(this.targetDir, "client-runtime.ts"));
    stream.write(ASYNC_CODE);
    await endStream(stream);
  }

  private async writeIndex(schema: GraphQLSchema) {
    const stream = createStream(join(this.targetDir, "index.ts"));
    stream.write(`export type { GraphQLExecutor, GraphQLSubscriber } from "./client-runtime";\n`);
    stream.write(
      `export { setGraphQLExecutor, setGraphQLSubscriber, execute, subscribe } from "./client-runtime";\n`,
    );
    stream.write("export type { ImplementationType } from './type-hierarchy';\n");
    stream.write(
      "export { upcastTypes, downcastTypes } from './type-hierarchy';\n",
    );
    await endStream(stream);
  }

  /**
   * Creates node_modules/@ptdgrp/typedgql/index.ts
   * so users can import generated types and the root gateway via `import { G } from '@ptdgrp/typedgql'`.
   * Also patches package.json exports for ESM/type resolution to point to the generated entry.
   */
  private async writePackageEntrypoint(
    schema: GraphQLSchema,
    ctx: SelectionContext,
  ) {
    await mkdir(PACKAGE_DIR, { recursive: true });

    const indexStream = createStream(join(PACKAGE_DIR, "index.ts"));
    this.writePackageIndexCode(indexStream, schema, ctx);
    await endStream(indexStream);

    await this.patchPackageJsonForGeneratedEntrypoint();
  }

  private async patchPackageJsonForGeneratedEntrypoint() {
    const packageJsonPath = join(PACKAGE_DIR, "package.json");
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as {
      types?: string;
      exports?: Record<string, unknown>;
    };

    const exportsMap =
      typeof pkg.exports === "object" && pkg.exports !== null
        ? (pkg.exports as Record<string, unknown>)
        : {};
    const rootExportRaw = exportsMap["."];
    const rootExport =
      typeof rootExportRaw === "object" && rootExportRaw !== null
        ? (rootExportRaw as Record<string, unknown>)
        : {};

    const importExportRaw = rootExport.import;
    const importExport =
      typeof importExportRaw === "object" && importExportRaw !== null
        ? (importExportRaw as Record<string, unknown>)
        : {};

    // ESM consumers and TypeScript should resolve to generated entrypoint.
    importExport.types = "./index.ts";
    importExport.default = "./index.ts";
    rootExport.import = importExport;
    exportsMap["."] = rootExport;
    pkg.exports = exportsMap;
    pkg.types = "./index.ts";

    await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }

  private writePackageIndexCode(
    stream: WriteStream,
    schema: GraphQLSchema,
    _ctx: SelectionContext,
  ) {
    const typeMap = schema.getTypeMap();
    const queryType = typeMap["Query"];
    const mutationType = typeMap["Mutation"];
    const subscriptionType = typeMap["Subscription"];

    // Re-export everything from the generated __generated/index.ts
    // (includes execute, setGraphQLExecutor, ImplementationType, upcastTypes, etc.)
    stream.write(`export * from './__generated/index';\n`);

    // Import root operation selections for building the gateway object.
    if (queryType instanceof GraphQLObjectType) {
      stream.write(
        `import { query$ } from './__generated/selections/${toKebabCase("QuerySelection")}';\n`,
      );
    }
    if (mutationType instanceof GraphQLObjectType) {
      stream.write(
        `import { mutation$ } from './__generated/selections/${toKebabCase("MutationSelection")}';\n`,
      );
    }
    if (subscriptionType instanceof GraphQLObjectType) {
      stream.write(
        `import { subscription$ } from './__generated/selections/${toKebabCase("SubscriptionSelection")}';\n`,
      );
    }
    stream.write("\n");

    // Re-export root operation selections for direct imports:
    // import { query$, mutation$, subscription$ } from '@ptdgrp/typedgql'
    if (queryType instanceof GraphQLObjectType) {
      stream.write("export { query$ };\n");
    }
    if (mutationType instanceof GraphQLObjectType) {
      stream.write("export { mutation$ };\n");
    }
    if (subscriptionType instanceof GraphQLObjectType) {
      stream.write("export { subscription$ };\n");
    }
    stream.write("\n");

    stream.write("export const G = {\n");
    if (queryType instanceof GraphQLObjectType) {
      stream.write("  query: () => query$,\n");
    }
    if (mutationType instanceof GraphQLObjectType) {
      stream.write("  mutation: () => mutation$,\n");
    }
    if (subscriptionType instanceof GraphQLObjectType) {
      stream.write("  subscription: () => subscription$,\n");
    }
    stream.write("} as const;\n");

    if (this.hasGeneratedEnums(schema)) {
      stream.write(`export * from './__generated/enums';\n`);
    }
    if (this.hasGeneratedInputs(schema)) {
      stream.write(`export * from './__generated/inputs';\n`);
    }
    stream.write(`export type * from './__generated/type-hierarchy';\n`);
  }

  private hasGeneratedEnums(schema: GraphQLSchema): boolean {
    const typeMap = schema.getTypeMap();
    for (const typeName in typeMap) {
      if (typeName.startsWith("__")) continue;
      const type = typeMap[typeName]!;
      if (type instanceof GraphQLEnumType && !isExcludedTypeName(this.options, type.name)) {
        return true;
      }
    }
    return false;
  }

  private hasGeneratedInputs(schema: GraphQLSchema): boolean {
    const typeMap = schema.getTypeMap();
    for (const typeName in typeMap) {
      if (typeName.startsWith("__")) continue;
      const type = typeMap[typeName]!;
      if (type instanceof GraphQLInputObjectType && !isExcludedTypeName(this.options, type.name)) {
        return true;
      }
    }
    return false;
  }

  // ── Schema validation ──

  private validateSchema(schema: GraphQLSchema): void {
    const typeMap = schema.getTypeMap();

    // Check for reserved field names
    for (const typeName in typeMap) {
      const type = typeMap[typeName]!;
      if (
        type instanceof GraphQLObjectType ||
        type instanceof GraphQLInterfaceType
      ) {
        for (const fieldName in type.getFields()) {
          if (RESERVED_FIELDS.has(fieldName)) {
            throw new Error(
              `Illegal field '${fieldName}' of type '${typeName}', ` +
              "it's name is protected by '@ptdgrp/typedgql', please change the server-side app",
            );
          }
        }
      }
    }

    // Validate idFieldMap
    const { idFieldMap } = this.options;
    if (idFieldMap) {
      for (const typeName in idFieldMap) {
        const type = typeMap[typeName];
        if (
          !(type instanceof GraphQLObjectType) &&
          !(type instanceof GraphQLInterfaceType)
        ) {
          throw new Error(
            `config.idFieldMap contains an illegal key '${typeName}', ` +
            "that is neither a graphql object type nor graphql interface type",
          );
        }
        const idField = type.getFields()[idFieldMap[typeName]!];
        if (!idField) {
          throw new Error(
            `config.idFieldMap['${typeName}'] is illegal, ` +
            `there is no field named '${idFieldMap[typeName]}' in the type '${typeName}'`,
          );
        }
        if (targetTypeOf(idField.type) !== undefined) {
          throw new Error(
            `config.idFieldMap['${typeName}'] is illegal, ` +
            `the field '${idFieldMap[typeName]}' of the type '${typeName}' is not scalar`,
          );
        }
      }
    }

    // Validate defaultSelectionExcludeMap
    const { defaultSelectionExcludeMap: excludeMap } = this.options;
    if (excludeMap) {
      for (const typeName in excludeMap) {
        const type = typeMap[typeName];
        if (
          !(type instanceof GraphQLObjectType) &&
          !(type instanceof GraphQLInterfaceType)
        ) {
          throw new Error(
            `config.defaultSelectionExcludeMap contains an illegal key '${typeName}' ` +
            "that is neither a graphql object type nor graphql interface type",
          );
        }
        const fieldMap = type.getFields();
        const fieldNames = excludeMap[typeName]!;
        if (!Array.isArray(fieldNames)) {
          throw new Error(
            `config.defaultSelectionExcludeMap['${typeName}'] is not array`,
          );
        }
        for (let i = 0; i < fieldNames.length; i++) {
          const fieldName = fieldNames[i]!;
          if (fieldMap[fieldName] === undefined) {
            throw new Error(
              `config.defaultSelectionExcludeMap['${typeName}'][${i}] is illegal, ` +
              `its value '${fieldName}' is not a field of graphql type '${typeName}'`,
            );
          }
        }
      }
    }
  }
}

// ─── Utilities ───────────────────────────────────────────────────────

export function createStream(path: string): WriteStream {
  return createWriteStream(path);
}

export function endStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });
}

function parseConnectionType(
  type: GraphQLObjectType | GraphQLInterfaceType,
):
  | [
    GraphQLObjectType | GraphQLInterfaceType,
    GraphQLObjectType | GraphQLInterfaceType,
    GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ]
  | undefined {
  const edges = type.getFields()["edges"];
  if (!edges) return undefined;

  const listType =
    edges.type instanceof GraphQLNonNull ? edges.type.ofType : edges.type;
  if (!(listType instanceof GraphQLList)) return undefined;

  const edgeType =
    listType.ofType instanceof GraphQLNonNull
      ? listType.ofType.ofType
      : listType.ofType;
  if (!(edgeType instanceof GraphQLObjectType)) return undefined;

  const node = edgeType.getFields()["node"];
  if (!node) return undefined;

  if (!(edges.type instanceof GraphQLNonNull)) {
    warn(`The type "${type.name}" is connection, its field "edges" must be not-null list`);
  }
  if (!(listType.ofType instanceof GraphQLNonNull)) {
    warn(`The type "${type.name}" is connection, element of its field "edges" must be not-null`);
  }

  let nodeType: GraphQLType;
  if (node.type instanceof GraphQLNonNull) {
    nodeType = node.type.ofType;
  } else {
    warn(`The type "${edgeType}" is edge, its field "node" must be non-null`);
    nodeType = node.type;
  }

  if (
    !(nodeType instanceof GraphQLObjectType) &&
    !(nodeType instanceof GraphQLInterfaceType) &&
    !(nodeType instanceof GraphQLUnionType)
  ) {
    throw new Error(
      `The type "${edgeType}" is edge, its field "node" must be object, interface, union or their non-null wrappers`,
    );
  }

  const cursor = edgeType.getFields()["cursor"];
  if (!cursor) {
    warn(`The type "${edgeType}" is edge, it must defined a field named "cursor"`);
  } else {
    const cursorType =
      cursor.type instanceof GraphQLNonNull
        ? cursor.type.ofType
        : cursor.type;
    if (cursorType !== GraphQLString) {
      throw new Error(
        `The type "${edgeType}" is edge, its field "cursor" must be string`,
      );
    }
  }

  return [type, edgeType, nodeType];
}

function warn(message: string) {
  console.warn(`[typedgql] ${message}`);
}
