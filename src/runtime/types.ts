import type { SchemaType } from "./schema";
import type { FieldOptionsValue } from "./field-options";
import type { ParameterRef } from "./parameter";

export const __phantom: unique symbol = Symbol("__phantom");
export const __runtime: unique symbol = Symbol("__selection_runtime");

// ─── Core Selection Interface ──────────────────────────────────────────

export interface Selection<
  E extends string,
  T extends object,
  TVariables extends object,
> {
  toString(): string;
  toFragmentString(): string;
  toJSON(): string;

  readonly [__phantom]: readonly [E, T, TVariables];
}

export interface SelectionRuntime<E extends string = string> {
  readonly schemaType: SchemaType<E>;
  readonly operationName?: string;
  readonly fieldMap: ReadonlyMap<string, FieldSelection>;
  readonly directiveMap: ReadonlyMap<string, DirectiveArgs>;
  readonly variableTypeMap: ReadonlyMap<string, string>;

  findField(fieldKey: string): FieldSelection | undefined;
  findFieldsByName(fieldName: string): readonly FieldSelection[];
  findFieldByName(fieldName: string): FieldSelection | undefined;
}

export type ExecutableSelection<
  E extends string,
  T extends object,
  TVariables extends object,
> = Selection<E, T, TVariables> & {
  readonly [__runtime]: SelectionRuntime<E>;
};

export function runtimeOf<
  E extends string,
  T extends object,
  TVariables extends object,
>(selection: Selection<E, T, TVariables>): SelectionRuntime<E> {
  return (selection as ExecutableSelection<E, T, TVariables>)[__runtime];
}

// ─── Utility Types ────────────────────────────────────────────────────

export type ShapeOf<F> =
  F extends Selection<string, infer M, object> ? M : never;

export type VariablesOf<T> =
  T extends Selection<string, object, infer TVariables> ? TVariables : never;

export type Expand<T> =
  T extends ReadonlyArray<infer U>
    ? ReadonlyArray<Expand<U>>
    : T extends Array<infer U>
      ? Array<Expand<U>>
      : T extends object
        ? { [K in keyof T]: Expand<T[K]> }
        : T;

export type ValueOrThunk<T> = T | (() => T);
export interface FieldSelection {
  readonly name: string;
  readonly argGraphQLTypes?: ReadonlyMap<string, string>;
  readonly args?: object;
  readonly fieldOptionsValue?: FieldOptionsValue;
  readonly plural: boolean;
  readonly childSelections?: ReadonlyArray<
    ExecutableSelection<string, object, object>
  >;
}

// ─── Directives & Fragments ──────────────────────────────────────────

export type DirectiveArgs =
  | { readonly [key: string]: ParameterRef<string> | StringValue | any }
  | undefined;

export class StringValue {
  constructor(
    readonly value: any,
    readonly quotationMarks: boolean = true,
  ) {}
}

export const __fragment_spread = Symbol("__fragment_spread");

export abstract class FragmentSpread<
  TFragmentName extends string,
  E extends string,
  T extends object,
  TVariables extends object,
> {
  readonly [__fragment_spread] = true;

  protected constructor(
    readonly name: TFragmentName,
    readonly selection: ExecutableSelection<E, T, TVariables>,
  ) {}
}

export class FragmentRef<
  TFragmentName extends string,
  E extends string,
  T extends object,
  TVariables extends object,
> extends FragmentSpread<TFragmentName, E, T, TVariables> {
  constructor(
    name: TFragmentName,
    selection: ExecutableSelection<E, T, TVariables>,
  ) {
    super(name, selection);
  }
}
