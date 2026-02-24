import { SelectionImpl } from "./selection";
import { __FRAGMENT_SPREAD } from "./types";
import { runtimeOf } from "./types";
import type { Selection, ExecutableSelection, DirectiveArgs, FragmentSpread } from "./types";
import { SchemaType, createSchemaType, resolveRegisteredSchemaType } from "./schema";
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
    new SelectionImpl([schemaType, enumInputMetadata, unionEntityTypes], false, ""),
    proxyHandler(schemaType),
  ) as unknown as F;
}

// ─── Property access proxy handler ────────────────────────────────────

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
      if (p === " $category") return schemaType.category;

      if (typeof p === "string") {
        // Built-in $-prefixed methods
        if (p === "$omit" || p === "$alias" || p === "$directive" || p === "$include" || p === "$skip") {
          return new Proxy(DUMMY, methodHandler(target, handler, p));
        }
        // $on → method
        else if (p === "$on") {
          return new Proxy(DUMMY, methodHandler(target, handler, p));
        }
        // Known field
        else if (schemaType.fields.has(p)) {
          const field = schemaType.fields.get(p)!;

          // Association fields → callback pattern
          if (field.isAssociation || field.targetTypeName !== undefined) {
            return (...argArray: any[]) => {
              const targetTypeName = field.targetTypeName ?? field.connectionTypeName;
              if (!targetTypeName) throw new Error(`Field "${p}" has no target type`);
              const targetSchemaType = resolveRegisteredSchemaType(targetTypeName);
              if (!targetSchemaType) {
                throw new Error(
                  `Cannot resolve schema type "${targetTypeName}" for field "${p}" on "${schemaType.name}"`,
                );
              }
              let args: { [key: string]: any } | undefined;
              let childSelectionFactory: ((f: any) => any) | undefined;
              let childSelection: any | undefined;
              for (const arg of argArray) {
                if (arg instanceof SelectionImpl) {
                  childSelection = arg;
                } else if (typeof arg === "function") {
                  childSelectionFactory = arg;
                } else {
                  args = arg;
                }
              }

              if (childSelectionFactory) {
                childSelection = childSelectionFactory(
                  new Proxy(
                    new SelectionImpl(
                      [targetSchemaType,
                      (target as any)._enumInputMetadata, undefined],
                      false, "",
                    ),
                    proxyHandler(targetSchemaType),
                  ),
                );
              }
              if (!childSelection) {
                throw new Error(`Field "${p}" requires a child selection`);
              }

              if (!args) {
                const argMap = field.argGraphQLTypeMap;
                if (argMap.size) {
                  const requiredArgNames = Array.from(argMap.entries())
                    .filter(([, type]) => type.endsWith("!"))
                    .map(([name]) => name);
                  if (requiredArgNames.length) {
                    args = {};
                    for (const name of requiredArgNames) {
                      args[name] = ParameterRef.of(name);
                    }
                  }
                }
              }

              return new Proxy(target.addField(p, args, childSelection), handler);
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
        const childSelection: ExecutableSelection<string, object, object> = isFragmentSpread
          ? (child as FragmentSpread<string, string, object, object>).selection
          : child as ExecutableSelection<string, object, object>;
        const fragmentName: string | undefined = isFragmentSpread
          ? (child as FragmentSpread<string, string, object, object>).name
          : argArray[1];

        let parent: SelectionImpl<string, object, object> = targetSelection;
        if (targetSelection.schemaType.name !== runtimeOf(childSelection).schemaType.name) {
          parent = targetSelection.addField("__typename");
        }
        return new Proxy(
          parent.addEmbeddable(childSelection as SelectionImpl<string, object, object>, fragmentName),
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
        if (!lastField) throw new Error("$alias requires a preceding field selection");
        const optionsValue: FieldOptionsValue = { alias, directives: new Map() };
        let current = targetSelection.removeField(lastField);
        current = current.addField(lastField, undefined, undefined, optionsValue);
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
        const directives = new Map<string, DirectiveArgs>();
        directives.set(argArray[0] as string, argArray[1] as DirectiveArgs);
        const optionsValue: FieldOptionsValue = { directives };
        let current = targetSelection.removeField(lastField);
        current = current.addField(lastField, undefined, undefined, optionsValue);
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
        const directives = new Map<string, DirectiveArgs>();
        directives.set(directiveName, directiveArgs);
        const optionsValue: FieldOptionsValue = { directives };
        let current = targetSelection.removeField(lastField);
        current = current.addField(lastField, undefined, undefined, optionsValue);
        return new Proxy(current, handler);
      }

      // Regular field method call
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

      // Auto-parameterize unset args
      if (!args) {
        const argMap = targetSelection.schemaType.ownFields.get(field)?.argGraphQLTypeMap;
        if (argMap?.size) {
          const requiredArgNames = Array.from(argMap.entries())
            .filter(([, type]) => type.endsWith("!"))
            .map(([name]) => name);
          if (requiredArgNames.length) {
            args = {};
            for (const name of requiredArgNames) {
              args[name] = ParameterRef.of(name);
            }
          }
        }
      }

      return new Proxy(
        targetSelection.addField(field, args, child, optionsValue),
        handler,
      );
    },
  };
}

// ─── Sentinel ─────────────────────────────────────────────────────────

function DUMMY() { }

export const SELECTION_TARGET = new SelectionImpl(
  [createSchemaType("Any", "OBJECT", [], []), new EnumInputMetadataBuilder().build(), undefined],
  false,
  "",
);
