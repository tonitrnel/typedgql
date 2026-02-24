import type { EnumInputMetadata, EnumInputMetaType } from "./enum-metadata";
import type { SchemaType } from "./schema";
import type { FieldOptionsValue } from "./field-options";
import { __phantom, __selectionRuntime, runtimeOf } from "./types";
import type {
  Selection,
  ExecutableSelection,
  SelectionRuntime,
  FieldSelection,
  DirectiveArgs,
} from "./types";
import { StringValue } from "./types";
import { ParameterRef } from "./parameter";
import { TextBuilder } from "./text-builder";

// ─── SelectionImpl ─────────────────────────────────────────────────────
// Immutable linked-list node. Each field/directive operation returns a new
// node pointing back to its predecessor via `prev`. The linked list is
// walked lazily to build `fieldMap` / `directiveMap` / query text.

export class SelectionImpl<
  E extends string,
  T extends object,
  TVariables extends object,
> implements Selection<E, T, TVariables> {
  declare readonly [__phantom]: readonly [T, TVariables];
  readonly [__selectionRuntime]: SelectionRuntime<E> = this;

  private _fieldMap?: ReadonlyMap<string, FieldSelection>;
  private _directiveMap?: ReadonlyMap<string, DirectiveArgs>;
  private _result?: SerializedResult;

  constructor(
    private readonly _ctx:
      | SelectionImpl<string, object, object>
      | readonly [SchemaType<E>, EnumInputMetadata, string[] | undefined],
    private readonly _negative: boolean,
    private readonly _field: string,
    private readonly _args?: { [key: string]: any },
    private readonly _child?: SelectionImpl<string, object, object>,
    private readonly _fieldOptionsValue?: FieldOptionsValue,
    private readonly _directive?: string,
    private readonly _directiveArgs?: DirectiveArgs,
  ) { }

  // ── Last field accessor (for $alias) ──

  get lastField(): string {
    return this._field;
  }

  // ── Schema metadata ──

  private get _schemaType(): SchemaType<E> {
    return Array.isArray(this._ctx)
      ? this._ctx[0] as SchemaType<E>
      : (this._ctx as SelectionImpl<string, object, object>)._schemaType as SchemaType<E>;
  }

  private get _enumInputMetadata(): EnumInputMetadata {
    return Array.isArray(this._ctx)
      ? this._ctx[1] as EnumInputMetadata
      : (this._ctx as SelectionImpl<string, object, object>)._enumInputMetadata;
  }

  private get _unionItemTypes(): string[] | undefined {
    return Array.isArray(this._ctx)
      ? (this._ctx.length > 2 && this._ctx[2]?.length ? this._ctx[2] : undefined)
      : (this._ctx as SelectionImpl<string, object, object>)._unionItemTypes;
  }

  private get _prev(): SelectionImpl<string, object, object> | undefined {
    return Array.isArray(this._ctx) ? undefined : this._ctx as SelectionImpl<string, object, object>;
  }

  get schemaType(): SchemaType<E> {
    return this._schemaType;
  }

  // ── Builders (return new immutable nodes) ──

  addField<F extends SelectionImpl<string, object, object>>(
    field: string,
    args?: { [key: string]: any },
    child?: SelectionImpl<string, object, object>,
    optionsValue?: FieldOptionsValue,
  ): F {
    return new SelectionImpl(this, false, field, args, child, optionsValue) as unknown as F;
  }

  removeField<F extends SelectionImpl<string, object, object>>(field: string): F {
    if (field === "__typename") throw new Error("__typename cannot be removed");
    return new SelectionImpl(this, true, field) as unknown as F;
  }

  addEmbeddable<F extends SelectionImpl<string, object, object>>(
    child: SelectionImpl<string, object, object>,
    fragmentName?: string,
  ): F {
    let fieldName: string;
    if (fragmentName !== undefined) {
      if (fragmentName.length === 0) throw new Error("fragmentName cannot be ''");
      if (fragmentName.startsWith("on ")) throw new Error("fragmentName cannot start with 'on '");
      fieldName = `... ${fragmentName}`;
    } else if (
      child._schemaType.name === this._schemaType.name ||
      child._unionItemTypes !== undefined
    ) {
      fieldName = "...";
    } else {
      fieldName = `... on ${child._schemaType.name}`;
    }
    return new SelectionImpl(this, false, fieldName, undefined, child) as unknown as F;
  }

  addDirective<F extends SelectionImpl<string, object, object>>(
    directive: string,
    directiveArgs?: DirectiveArgs,
  ): F {
    return new SelectionImpl(
      this, false, "", undefined, undefined, undefined, directive, directiveArgs,
    ) as unknown as F;
  }

  // ── Computed maps (lazy, cached) ──

  get fieldMap(): ReadonlyMap<string, FieldSelection> {
    return (this._fieldMap ??= this._buildFieldMap());
  }

  get directiveMap(): ReadonlyMap<string, DirectiveArgs> {
    return (this._directiveMap ??= this._buildDirectiveMap());
  }

  get variableTypeMap(): ReadonlyMap<string, string> {
    return this._serialize().variableTypeMap;
  }

  // ── Lookup helpers ──

  findField(fieldKey: string): FieldSelection | undefined {
    const field = this.fieldMap.get(fieldKey);
    if (field) return field;
    for (const [, f] of this.fieldMap) {
      if (f.name.startsWith("...") && f.childSelections) {
        for (const child of f.childSelections) {
          const deeper = child.findField(fieldKey);
          if (deeper) return deeper;
        }
      }
    }
    return undefined;
  }

  findFieldsByName(fieldName: string): readonly FieldSelection[] {
    const out: FieldSelection[] = [];
    this._collectFieldsByName(fieldName, out);
    return out;
  }

  findFieldByName(fieldName: string): FieldSelection | undefined {
    const fields = this.findFieldsByName(fieldName);
    if (fields.length > 1) {
      throw new Error(
        `Too many fields named "${fieldName}" in selection of type "${this._schemaType.name}"`,
      );
    }
    return fields[0];
  }

  // ── Serialization ──

  toString(): string {
    return this._serialize().text;
  }

  toFragmentString(): string {
    return this._serialize().fragmentText;
  }

  toJSON(): string {
    return JSON.stringify(this._serialize());
  }

  " $supressWarnings"(_: T, _2: TVariables): never {
    throw new Error("' $supressWarnings' is not supported");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private implementation
  // ═══════════════════════════════════════════════════════════════════

  private _buildFieldMap(): ReadonlyMap<string, FieldSelection> {
    // Collect all nodes in chain order
    const nodes: SelectionImpl<string, object, object>[] = [];
    for (let n: SelectionImpl<string, object, object> | undefined = this; n; n = n._prev) {
      if (n._field !== "") nodes.push(n);
    }

    const map = new Map<string, FieldSelection>();
    // Process oldest → newest
    for (let i = nodes.length - 1; i >= 0; --i) {
      const n = nodes[i]!;
      const key = n._fieldOptionsValue?.alias ?? n._field;

      if (n._field.startsWith("...")) {
        let children = map.get(key)?.childSelections as SelectionImpl<string, object, object>[] | undefined;
        if (!children) {
          children = [];
          map.set(key, { name: n._field, plural: false, childSelections: children });
        }
        children.push(n._child!);
      } else if (n._negative) {
        map.delete(key);
      } else {
        map.set(key, {
          name: n._field,
          argGraphQLTypes: n._schemaType.fields.get(n._field)?.argGraphQLTypeMap,
          args: n._args,
          fieldOptionsValue: n._fieldOptionsValue,
          plural: n._schemaType.fields.get(n._field)?.isPlural ?? false,
          childSelections: n._child ? [n._child] : undefined,
        });
      }
    }
    return map;
  }

  private _buildDirectiveMap(): ReadonlyMap<string, DirectiveArgs> {
    const map = new Map<string, DirectiveArgs>();
    for (let n: SelectionImpl<string, object, object> | undefined = this; n; n = n._prev) {
      if (n._directive !== undefined && !map.has(n._directive)) {
        map.set(n._directive, n._directiveArgs);
      }
    }
    return map;
  }

  private _collectFieldsByName(fieldName: string, out: FieldSelection[]) {
    for (const field of this.fieldMap.values()) {
      if (field.name === fieldName) {
        out.push(field);
      } else if (field.name.startsWith("...") && field.childSelections) {
        for (const child of field.childSelections) {
          out.push(...child.findFieldsByName(fieldName));
        }
      }
    }
  }

  // ── Query serialization ─────────────────────────────────────────

  private _serialize(): SerializedResult {
    return (this._result ??= serialize(this));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Serialization (extracted from old ResultContext)
// ═══════════════════════════════════════════════════════════════════════

interface SerializedResult {
  readonly text: string;
  readonly fragmentText: string;
  readonly variableTypeMap: ReadonlyMap<string, string>;
}

function serialize(root: SelectionImpl<string, object, object>): SerializedResult {
  const writer = new TextBuilder();
  const fragmentWriter = new TextBuilder();
  let ctx = new SerializeContext(writer);

  ctx.acceptDirectives(root.directiveMap);
  writer.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
    ctx.acceptSelection(root);
  });

  const renderedFragments = new Set<string>();
  while (true) {
    const fragmentMap = ctx.namedFragmentMap;
    if (fragmentMap.size === 0) break;
    ctx = new SerializeContext(fragmentWriter, ctx);
    for (const [name, fragment] of fragmentMap) {
      if (renderedFragments.add(name)) {
        fragmentWriter.text(`fragment ${name} on ${fragment.schemaType.name} `);
        ctx.acceptDirectives(fragment.directiveMap);
        fragmentWriter.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
          ctx.acceptSelection(fragment);
        });
      }
    }
  }

  return {
    text: writer.toString(),
    fragmentText: fragmentWriter.toString(),
    variableTypeMap: ctx.variableTypeMap,
  };
}

class SerializeContext {
  readonly namedFragmentMap = new Map<string, ExecutableSelection<string, object, object>>();
  readonly variableTypeMap: Map<string, string>;

  constructor(
    private readonly writer: TextBuilder,
    prev?: SerializeContext,
  ) {
    this.variableTypeMap = prev?.variableTypeMap ?? new Map();
  }

  acceptSelection(sel: Selection<string, object, object>) {
    const t = this.writer.text.bind(this.writer);
    const runtime = runtimeOf(sel);
    for (const field of runtime.fieldMap.values()) {
      const name = field.name;
      if (name !== "...") {
        const alias = field.fieldOptionsValue?.alias;
        if (alias && alias !== name) t(`${alias}: `);
        t(name);
        if (field.argGraphQLTypes) {
          const meta = (sel as any)._enumInputMetadata as EnumInputMetadata;
          this.acceptArgs(field.args, field.argGraphQLTypes, meta);
        }
        this.acceptDirectives(field.fieldOptionsValue?.directives);
      }

      const children = field.childSelections;
      if (children?.length) {
        if (name === "...") {
          for (const c of children) this.acceptSelection(c);
        } else if (name.startsWith("...") && !name.startsWith("... on ")) {
          const fragName = name.substring("...".length).trim();
          const old = this.namedFragmentMap.get(fragName);
          for (const c of children) {
            if (old && old !== c) throw new Error(`Conflict fragment name ${fragName}`);
            this.namedFragmentMap.set(fragName, c);
          }
        } else {
          t(" ");
          this.writer.scope({ type: "block", multiLines: true }, () => {
            for (const c of children) this.acceptSelection(c);
          });
        }
      }
      t("\n");
    }
  }

  acceptDirectives(directives?: ReadonlyMap<string, DirectiveArgs>) {
    if (!directives) return;
    for (const [directive, args] of directives) {
      this.writer.text(`\n@${directive}`);
      this.acceptArgs(args);
    }
  }

  private acceptArgs(
    args?: object,
    argGraphQLTypeMap?: ReadonlyMap<string, string>,
    enumInputMetadata?: EnumInputMetadata,
  ) {
    if (!args) return;
    const t = this.writer.text.bind(this.writer);

    let hasField: boolean;
    if (argGraphQLTypeMap) {
      hasField = false;
      for (const argName in args) {
        if (argGraphQLTypeMap.get(argName) !== undefined) { hasField = true; break; }
        else console.warn(`Unexpected argument: ${argName}`);
      }
    } else {
      hasField = Object.keys(args).length !== 0;
    }

    if (hasField) {
      this.writer.scope(
        { type: "arguments", multiLines: isMultiLineJSON(args) },
        () => {
          for (const argName in args) {
            this.writer.separator();
            const arg = (args as any)[argName];

            if (argGraphQLTypeMap) {
              const typeName = argGraphQLTypeMap.get(argName);
              if (typeName !== undefined) {
                if (arg[" $__instanceOfParameterRef"]) {
                  const ref = arg as ParameterRef<string>;
                  if (ref.graphqlTypeName && ref.graphqlTypeName !== typeName) {
                    throw new Error(
                      `Argument '${ref.name}' type conflict: '${typeName}' vs ParameterRef '${ref.graphqlTypeName}'`,
                    );
                  }
                  const existing = this.variableTypeMap.get(ref.name);
                  if (existing && existing !== typeName) {
                    throw new Error(
                      `Argument '${ref.name}' type conflict: '${existing}' vs '${typeName}'`,
                    );
                  }
                  this.variableTypeMap.set(ref.name, typeName);
                  t(`${argName}: $${ref.name}`);
                } else {
                  t(`${argName}: `);
                  this.acceptLiteral(
                    arg,
                    SerializeContext.enumMetaType(enumInputMetadata, typeName),
                  );
                }
              } else {
                throw new Error(`Unknown argument '${argName}'`);
              }
            } else {
              if (arg[" $__instanceOfParameterRef"]) {
                const ref = arg as ParameterRef<string>;
                if (!ref.graphqlTypeName) {
                  throw new Error(`Directive argument '${ref.name}' requires graphqlTypeName`);
                }
                this.variableTypeMap.set(ref.name, ref.graphqlTypeName);
                t(`${argName}: $${ref.name}`);
              } else {
                t(`${argName}: `);
                this.acceptLiteral(arg, undefined);
              }
            }
          }
        },
      );
    }
  }

  private acceptLiteral(value: any, metaType: EnumInputMetaType | undefined) {
    const t = this.writer.text.bind(this.writer);

    if (value == null) { t("null"); return; }
    if (typeof value === "number") { t(value.toString()); return; }
    if (typeof value === "string") { t(metaType ? value : JSON.stringify(value)); return; }
    if (typeof value === "boolean") { t(value ? "true" : "false"); return; }
    if (value instanceof StringValue) {
      t(value.quotationMarks ? JSON.stringify(value.value) : value.value);
      return;
    }

    if (Array.isArray(value) || value instanceof Set) {
      this.writer.scope({ type: "array" }, () => {
        for (const e of value) {
          this.writer.separator(", ");
          this.acceptLiteral(e, metaType);
        }
      });
    } else if (value instanceof Map) {
      this.writer.scope({ type: "block" }, () => {
        for (const [k, v] of value) {
          this.writer.separator(", ");
          this.writer.text(k);
          t(": ");
          this.acceptLiteral(v, metaType?.fields?.get(k));
        }
      });
    } else if (typeof value === "object") {
      this.writer.scope({ type: "block" }, () => {
        for (const k in value) {
          this.writer.separator(", ");
          this.writer.text(k);
          t(": ");
          this.acceptLiteral(value[k], metaType?.fields?.get(k));
        }
      });
    }
  }

  private static enumMetaType(
    meta: EnumInputMetadata | undefined,
    typeName: string | undefined,
  ): EnumInputMetaType | undefined {
    if (!meta || !typeName) return undefined;
    return meta.get(typeName.split(/\[|\]|!/).join(""));
  }
}

function isMultiLineJSON(obj: any): boolean {
  let size = 0;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      if (typeof v === "object" && !v[" $__instanceOfParameterRef"]) return true;
      if (++size > 2) return true;
    }
  } else if (typeof obj === "object") {
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === "object" && !v[" $__instanceOfParameterRef"]) return true;
      if (++size > 2) return true;
    }
  }
  return false;
}
