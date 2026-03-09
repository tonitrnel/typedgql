/**
 * Runtime marker for `ParameterRef`.
 *
 * We use a unique symbol instead of string keys to avoid accidental collision
 * with user objects passed as argument literals.
 */
export const __marker: unique symbol = Symbol("__parameter_ref_marker");

export class ParameterRef<TName extends string> {
  readonly [__marker] = true;

  private constructor(
    /** GraphQL variable name without `$` prefix. */
    readonly name: TName,
    /**
     * Optional GraphQL type annotation (e.g. `Boolean!`, `[String!]`).
     *
     * - Field argument position: usually omitted, type can be inferred from
     *   schema `argGraphQLTypeMap`.
     * - Directive/nested position: usually required to register variable type.
     */
    readonly explicitType?: string,
  ) {
    if (name.startsWith("$")) {
      throw new Error("parameter name cannot start with '$'");
    }
  }

  /**
   * Represents a GraphQL variable reference used in DSL argument objects.
   *
   * Example:
   * - `id: ParameterRef.of("postId")` -> `id: $postId`
   *
   * Main use cases:
   * 1. Rename/bind a field argument to a different variable name.
   * 2. Explicitly annotate variable type when runtime cannot infer it from a
   *    field argument position (for example directive args or nested literals).
   *
   * When `explicitType` is NOT needed:
   * - Field arg slot with schema type:
   *   `q.user({ id: ParameterRef.of("userId") }, (u) => u.id)`
   *   `id` type is inferred from schema (`ID!`).
   *
   * When `explicitType` IS needed:
   * - Directive arg slot:
   *   `node.$directive("include", { if: ParameterRef.of("withEmail", "Boolean!") })`
   * - Nested input slot without direct arg type context:
   *   `q.search({ filter: { keyword: ParameterRef.of("kw", "String!") } }, ...)`
   */
  static of<TName extends string>(
    name: TName,
    explicitType?: string,
  ): ParameterRef<TName> {
    return new ParameterRef<TName>(name, explicitType);
  }
}

export type AcceptableVariables<T extends object> = {
  [K in keyof T]: T[K] | ParameterRef<string>;
};

export type UnresolvedVariables<T, TVariables> = ReversedType<
  UnresolvedNames<UnresolvedRefs<T>>,
  TVariables
>;

type UnresolvedRefs<TVariables> = Pick<
  TVariables,
  {
    [K in keyof TVariables]: TVariables[K] extends ParameterRef<string>
      ? K
      : never;
  }[keyof TVariables]
>;

type UnresolvedNames<TUnresolvedVariableRefs> = {
  [K in keyof TUnresolvedVariableRefs]: ParameterRefName<
    TUnresolvedVariableRefs[K]
  >;
};

type ReversedType<T extends Record<keyof T, keyof any>, TStandard> = {
  [P in T[keyof T]]: {
    [K in keyof T]: T[K] extends P
      ? K extends keyof TStandard
        ? TStandard[K]
        : never
      : never;
  }[keyof T];
};

type ParameterRefName<T> =
  T extends ParameterRef<infer TRefName> ? TRefName : never;
