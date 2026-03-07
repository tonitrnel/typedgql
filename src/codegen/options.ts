import { type GraphQLSchema } from "graphql";

/**
 * Code generation options for typedgql.
 *
 * This interface is public API: each option controls how generated TypeScript
 * files are emitted from a GraphQL schema.
 */
export interface CodegenOptions {
  /**
   * Async schema loader used by codegen.
   *
   * Return a fully built `GraphQLSchema` from local SDL, remote introspection,
   * or any custom source.
   */
  readonly schemaLoader: () => Promise<GraphQLSchema>;
  /**
   * Output directory for generated files.
   *
   * If omitted, generator default path is used by caller.
   */
  readonly targetDir?: string;
  /**
   * Indentation string used in generated files.
   *
   * @default "    " (4 spaces)
   */
  readonly indent?: string;
  /**
   * Whether generated object fields are writable.
   *
   * - `false` => emit `readonly` object properties in generated types.
   * - `true` => emit mutable object properties.
   */
  readonly objectEditable?: boolean;
  /**
   * Whether generated array types are mutable.
   *
   * - `false` => emit `ReadonlyArray<T>`.
   * - `true` => emit `Array<T>`.
   */
  readonly arrayEditable?: boolean;
  /**
   * Suffix used for generated selection interface names.
   *
   * Example: with suffix `"Selection"`, type `User` becomes `UserSelection`.
   *
   * @default "Selection"
   */
  readonly selectionSuffix?: string;
  /**
   * GraphQL type names to exclude from selection generation.
   */
  readonly excludedTypes?: ReadonlyArray<string>;
  /**
   * Scalar type mapping for generated TypeScript types.
   *
   * Each mapped scalar is exposed as `UserScalarTypes.<ScalarName>` in generated
   * files, and codegen emits `export type <ScalarName> = <mappedType>` inside
   * generated `scalar-types.ts`.
   *
   * Example:
   * `{ JSON: "JsonObject", DateTime: "string" }`
   */
  readonly scalarTypeMap?: {
    readonly [key: string]: string;
  };
  /**
   * TypeScript declaration source emitted into generated `scalar-types.ts` namespace.
   *
   * Only `type/interface` declarations are allowed.
   * Exported declarations are visible for consumers, and non-exported ones can
   * be used as private helper types inside the namespace.
   */
  readonly scalarTypeDeclarations?: string;
  /**
   * Override ID field name per GraphQL object/interface type.
   *
   * Key is GraphQL type name, value is field name treated as the ID field.
   */
  readonly idFieldMap?: { readonly [key: string]: string };
  /**
   * Exclude fields from default selection (`$$`) per type.
   *
   * Key is GraphQL type name, value is list of field names to skip.
   */
  readonly defaultSelectionExcludeMap?: { readonly [key: string]: string[] };
  /**
   * Enum output strategy.
   *
   * - `false` / `undefined`: default enum writer behavior
   * - `"string"`: generate string enum style
   * - `"number"`: generate numeric enum style
   * - `true`: enable enum generation with default mode
   */
  readonly tsEnum?: boolean | "string" | "number";
}
