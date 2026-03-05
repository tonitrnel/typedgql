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
     * - String form: directly uses the provided TS type name.
     * - Object form: uses `typeName` and emits an import from `importSource`.
     *
     * Example:
     * `DateTime: { typeName: "DateTimeISO", importSource: "types/scalars" }`
     */
    readonly scalarTypeMap?: {
        readonly [key: string]:
        | string
        | { readonly typeName: string; readonly importSource: string };
    };
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
