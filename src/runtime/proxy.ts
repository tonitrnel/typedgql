import { SelectionImpl } from "./selection";
import { __FRAGMENT_SPREAD } from "./types";
import { runtimeOf } from "./types";
import type {
  Selection,
  ExecutableSelection,
  DirectiveArgs,
  FragmentSpread,
} from "./types";
import {
  SchemaType,
  createSchemaType,
  resolveRegisteredSchemaType,
} from "./schema";
import { createFieldOptions, FieldOptionsValue } from "./field-options";
import { ParameterRef } from "./parameter";
import { EnumInputMetadata, EnumInputMetadataBuilder } from "./enum-metadata";

export { createSchemaType };

// ─── Public factory ───────────────────────────────────────────────────

export function createSelection<
  E extends string,
  F extends Selection<E, object, object>,
>(
  schemaType: SchemaType<E>,
  enumInputMetadata: EnumInputMetadata,
  unionEntityTypes: string[] | undefined,
): F {
  return new Proxy(
    new SelectionImpl(
      [schemaType, enumInputMetadata, unionEntityTypes],
      false,
      "",
    ),
    proxyHandler(schemaType),
  ) as unknown as F;
}

// ─── Property access proxy handler ────────────────────────────────────

const BUILT_DIRECTIVES = new Set([
  "$omit",
  "$alias",
  "$directive",
  "$include",
  "$skip",
  "$on",
]);

function buildRequiredArgs(
  argTypeMap: ReadonlyMap<string, string>,
): { [key: string]: any } | undefined {
  if (!argTypeMap.size) return undefined;
  const requiredArgNames = Array.from(argTypeMap.entries())
    .filter(([, type]) => type.endsWith("!"))
    .map(([name]) => name);
  if (!requiredArgNames.length) return undefined;

  const args: { [key: string]: any } = {};
  for (const name of requiredArgNames) {
    args[name] = ParameterRef.of(name);
  }
  return args;
}

function resolveAssociationTarget(
  fieldName: string,
  fieldTargetTypeName: string | undefined,
  ownerTypeName: string,
): SchemaType {
  if (!fieldTargetTypeName) {
    throw new Error(`Field "${fieldName}" has no target type`);
  }
  const targetSchemaType = resolveRegisteredSchemaType(fieldTargetTypeName);
  if (!targetSchemaType) {
    throw new Error(
      `Cannot resolve schema type "${fieldTargetTypeName}" for field "${fieldName}" on "${ownerTypeName}"`,
    );
  }
  return targetSchemaType;
}

function parseAssociationArgs(argArray: any[]) {
  let args: { [key: string]: any } | undefined;
  let childSelectionFactory: ((f: any) => any) | undefined;
  let childSelection: SelectionImpl<string, object, object> | undefined;

  for (const arg of argArray) {
    if (arg instanceof SelectionImpl) {
      childSelection = arg;
    } else if (typeof arg === "function") {
      childSelectionFactory = arg;
    } else {
      args = arg;
    }
  }
  return { args, childSelectionFactory, childSelection };
}

function parseMethodArgs(argArray: any[]) {
  let args: { [key: string]: any } | undefined;
  let child: SelectionImpl<string, object, object> | undefined;
  let optionsValue: FieldOptionsValue | undefined;

  for (const arg of argArray) {
    if (arg instanceof SelectionImpl) {
      child = arg;
    } else if (typeof arg === "function") {
      optionsValue = arg(createFieldOptions()).value;
    } else {
      args = arg;
    }
  }
  return { args, child, optionsValue };
}

function findLastFieldSelection(
  selection: SelectionImpl<string, object, object>,
  lastField: string,
) {
  const byKey = selection.fieldMap.get(lastField);
  if (byKey) return byKey;
  // `lastField` can refer to a field removed earlier in the chain.
  const byName = selection.findFieldsByName(lastField);
  return byName.length ? byName[0] : undefined;
}

function rewriteLastFieldWithOptions(
  selection: SelectionImpl<string, object, object>,
  lastField: string,
  optionsValue: FieldOptionsValue,
) {
  const existing = findLastFieldSelection(selection, lastField);
  let current = selection.removeField(lastField);
  current = current.addField(
    lastField,
    existing?.args as { [key: string]: any } | undefined,
    existing?.childSelections?.[0] as SelectionImpl<string, object, object> | undefined,
    optionsValue,
  );
  return current;
}

function mergeLastFieldDirective(
  selection: SelectionImpl<string, object, object>,
  lastField: string,
  directiveName: string,
  directiveArgs: DirectiveArgs,
) {
  const existing = findLastFieldSelection(selection, lastField);
  const directives = new Map<string, DirectiveArgs>(
    existing?.fieldOptionsValue?.directives ?? [],
  );
  directives.set(directiveName, directiveArgs);
  const optionsValue: FieldOptionsValue = {
    alias: existing?.fieldOptionsValue?.alias,
    directives,
  };
  return rewriteLastFieldWithOptions(selection, lastField, optionsValue);
}

function proxyHandler(
  schemaType: SchemaType,
): ProxyHandler<SelectionImpl<string, object, object>> {
  const handler: ProxyHandler<SelectionImpl<string, object, object>> = {
    get: (
      target: SelectionImpl<string, object, object>,
      p: string | symbol,
      _receiver: any,
    ): any => {
      if (p === "schemaType") return schemaType;

      if (typeof p === "string") {
        // Built-in $-prefixed methods
        if (BUILT_DIRECTIVES.has(p)) {
          return new Proxy(DUMMY, methodHandler(target, handler, p));
        }
        // Known field
        else if (schemaType.fields.has(p)) {
          const field = schemaType.fields.get(p)!;

          // Association fields → callback pattern
          if (field.isAssociation || field.targetTypeName !== undefined) {
            return (...argArray: any[]) => {
              const targetSchemaType = resolveAssociationTarget(
                p,
                field.targetTypeName,
                schemaType.name,
              );
              let { args, childSelectionFactory, childSelection } =
                parseAssociationArgs(argArray);

              if (childSelectionFactory) {
                childSelection = childSelectionFactory(
                  new Proxy(
                    new SelectionImpl(
                      [
                        targetSchemaType,
                        (target as any)._enumInputMetadata,
                        undefined,
                      ],
                      false,
                      "",
                    ),
                    proxyHandler(targetSchemaType),
                  ),
                );
              }
              if (!childSelection) {
                throw new Error(`Field "${p}" requires a child selection`);
              }

              if (!args) {
                args = buildRequiredArgs(field.argGraphQLTypeMap);
              }

              return new Proxy(
                target.addField(p, args, childSelection),
                handler,
              );
            };
          }

          // Scalar with args → method
          if (field.isFunction) {
            return new Proxy(DUMMY, methodHandler(target, handler, p));
          }

          // Plain scalar → property access
          return new Proxy(target.addField(p), handler);
        }
      }
      return Reflect.get(target, p, target);
    },
  };
  return handler;
}

// ─── Method call proxy handler ────────────────────────────────────────

function methodHandler(
  targetSelection: SelectionImpl<string, object, object>,
  handler: ProxyHandler<SelectionImpl<string, object, object>>,
  field: string,
): ProxyHandler<Function> {
  return {
    apply: (_1: Function, _2: any, argArray: any[]): any => {
      // $on(child) – fragment embedding
      if (field === "$on") {
        const child = argArray[0];
        const isFragmentSpread = !!child?.[__FRAGMENT_SPREAD];
        const childSelection: ExecutableSelection<string, object, object> =
          isFragmentSpread
            ? (child as FragmentSpread<string, string, object, object>)
                .selection
            : (child as ExecutableSelection<string, object, object>);
        const fragmentName: string | undefined = isFragmentSpread
          ? (child as FragmentSpread<string, string, object, object>).name
          : argArray[1];

        let parent: SelectionImpl<string, object, object> = targetSelection;
        if (
          targetSelection.schemaType.name !==
          runtimeOf(childSelection).schemaType.name
        ) {
          parent = targetSelection.addField("__typename");
        }
        return new Proxy(
          parent.addEmbeddable(
            childSelection as SelectionImpl<string, object, object>,
            fragmentName,
          ),
          handler,
        );
      }

      // $omit(...fieldNames) – remove multiple fields
      if (field === "$omit") {
        let current: SelectionImpl<string, object, object> = targetSelection;
        for (const fieldName of argArray) {
          if (typeof fieldName === "string") {
            current = current.removeField(fieldName);
          }
        }
        return new Proxy(current, handler);
      }

      // $alias(alias) – rename the last selected field
      if (field === "$alias") {
        const alias = argArray[0] as string;
        const lastField = targetSelection.lastField;
        if (!lastField)
          throw new Error("$alias requires a preceding field selection");
        const existing = findLastFieldSelection(targetSelection, lastField);
        const optionsValue: FieldOptionsValue = {
          alias,
          directives: new Map(existing?.fieldOptionsValue?.directives ?? []),
        };
        const current = rewriteLastFieldWithOptions(
          targetSelection,
          lastField,
          optionsValue,
        );
        return new Proxy(current, handler);
      }

      // $directive(directiveName, args?) – field-level if there is a last field, otherwise selection-level
      if (field === "$directive") {
        const lastField = targetSelection.lastField;
        if (!lastField) {
          return new Proxy(
            targetSelection.addDirective(argArray[0], argArray[1]),
            handler,
          );
        }
        const current = mergeLastFieldDirective(
          targetSelection,
          lastField,
          argArray[0] as string,
          argArray[1] as DirectiveArgs,
        );
        return new Proxy(current, handler);
      }

      // $include(condition) / $skip(condition)
      if (field === "$include" || field === "$skip") {
        const directiveName = field === "$include" ? "include" : "skip";
        const directiveArgs = { if: argArray[0] } as DirectiveArgs;
        const lastField = targetSelection.lastField;
        if (!lastField) {
          return new Proxy(
            targetSelection.addDirective(directiveName, directiveArgs),
            handler,
          );
        }
        const current = mergeLastFieldDirective(
          targetSelection,
          lastField,
          directiveName,
          directiveArgs,
        );
        return new Proxy(current, handler);
      }

      // Regular field method call
      let { args, child, optionsValue } = parseMethodArgs(argArray);

      // Auto-parameterize unset args
      if (!args) {
        const argMap = targetSelection.schemaType.ownFields.get(field)?.argGraphQLTypeMap;
        args = argMap ? buildRequiredArgs(argMap) : undefined;
      }

      return new Proxy(
        targetSelection.addField(field, args, child, optionsValue),
        handler,
      );
    },
  };
}

// ─── Sentinel ─────────────────────────────────────────────────────────

function DUMMY() {}

export const SELECTION_TARGET = new SelectionImpl(
  [
    createSchemaType("Any", "OBJECT", [], []),
    new EnumInputMetadataBuilder().build(),
    undefined,
  ],
  false,
  "",
);
