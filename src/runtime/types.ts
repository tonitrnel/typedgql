import type { SchemaType } from "./schema";
import type { FieldOptionsValue } from "./field-options";
import type { ParameterRef } from "./parameter";

export const __phantom: unique symbol = Symbol("__phantom");
export const __selectionRuntime: unique symbol = Symbol("__selectionRuntime");

// ─── Core Selection Interface ──────────────────────────────────────────

export interface Selection<
  E extends string,
  T extends object,
  TVariables extends object,
> {
  toString(): string;
  toFragmentString(): string;
  toJSON(): string;

  readonly [__phantom]: readonly [T, TVariables];
}

export interface SelectionRuntime<E extends string = string> {
  readonly schemaType: SchemaType<E>;
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
  readonly [__selectionRuntime]: SelectionRuntime<E>;
};

export function runtimeOf<
  E extends string,
  T extends object,
  TVariables extends object,
>(
  selection: Selection<E, T, TVariables>,
): SelectionRuntime<E> {
  return (selection as ExecutableSelection<E, T, TVariables>)[__selectionRuntime];
}

// Category-branded subtypes
export interface ObjectSelection<
  E extends string,
  T extends object,
  TVariables extends object,
> extends Selection<E, T, TVariables> {
  readonly " $category": "OBJECT";
}

export interface ConnectionSelection<
  E extends string,
  T extends object,
  TVariables extends object,
> extends Selection<E, T, TVariables> {
  readonly " $category": "CONNECTION";
}

export interface EdgeSelection<
  E extends string,
  T extends object,
  TVariables extends object,
> extends Selection<E, T, TVariables> {
  readonly " $category": "EDGE";
}

// ─── Utility Types ────────────────────────────────────────────────────

export type ShapeOf<F> =
  F extends Selection<string, infer M, object>
    ? M
    : F extends ObjectSelection<string, infer M, object>
      ? M
      : F extends ConnectionSelection<string, infer M, object>
        ? M
        : F extends EdgeSelection<string, infer M, object>
          ? M
          : never;

export type Expand<T> =
  T extends ReadonlyArray<infer U>
    ? ReadonlyArray<Expand<U>>
    : T extends Array<infer U>
      ? Array<Expand<U>>
      : T extends object
        ? { [K in keyof T]: Expand<T[K]> }
        : T;

export interface FieldSelection {
  readonly name: string;
  readonly argGraphQLTypes?: ReadonlyMap<string, string>;
  readonly args?: object;
  readonly fieldOptionsValue?: FieldOptionsValue;
  readonly plural: boolean;
  readonly childSelections?: ReadonlyArray<ExecutableSelection<string, object, object>>;
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

export const __FRAGMENT_SPREAD = Symbol("FRAGMENT_SPREAD");

export abstract class FragmentSpread<
  TFragmentName extends string,
  E extends string,
  T extends object,
  TVariables extends object,
> {
  readonly [__FRAGMENT_SPREAD] = true;

  protected constructor(
    readonly name: TFragmentName,
    readonly selection: ExecutableSelection<E, T, TVariables>,
  ) {}
}
