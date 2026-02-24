import { WriteStream } from "fs";
import {
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import { CodegenOptions } from "./options";

export type ScopeType = "blank" | "block" | "parameters" | "array" | "generic";

export type ImportingBehavior = "self" | "same_dir" | "other_dir";

export interface ScopeArgs {
  readonly type: ScopeType;
  readonly multiLines?: boolean;
  readonly prefix?: string;
  readonly suffix?: string;
}

// ─── Lookup tables ───────────────────────────────────────────────────

const SCOPE_BRACKETS: Record<ScopeType, readonly [open: string, close: string]> = {
  blank: ["", ""],
  block: ["{", "}"],
  parameters: ["(", ")"],
  array: ["[", "]"],
  generic: ["<", ">"],
};

const SCALAR_MAP: Record<string, "string" | "number" | "boolean"> = {
  Boolean: "boolean",
  Byte: "number",
  Short: "number",
  Int: "number",
  Long: "number",
  Float: "number",
  Double: "number",
  BigInteger: "number",
  BigDecimal: "number",
  String: "string",
  Date: "string",
  DateTime: "string",
  LocalDate: "string",
  LocalDateTime: "string",
  ID: "string",
  UUID: "string",
};

// ─── Scope state ─────────────────────────────────────────────────────

interface ScopeState {
  readonly type: ScopeType;
  readonly multiLines: boolean;
  dirty: boolean;
}

const GLOBAL_SCOPE: ScopeState = {
  type: "blank",
  multiLines: true,
  dirty: true,
};

// ─── Writer ──────────────────────────────────────────────────────────

export abstract class Writer {
  protected readonly indent: string;

  private readonly scopes: ScopeState[] = [];
  private needIndent = false;
  private readonly importStatements = new Set<string>();
  private readonly importedTypes = new Set<GraphQLNamedType>();
  private readonly importedScalarTypes = new Map<string, Set<string>>();
  private importFinalized = false;

  constructor(
    private readonly stream: WriteStream,
    protected readonly options: CodegenOptions,
  ) {
    this.indent = options.indent ?? "    ";
  }

  /**
   * Two-phase render lifecycle:
   * 1) collect imports
   * 2) flush imports and emit body
   */
  write(): void {
    this.prepareImports();
    this.importFinalized = true;

    for (const stmt of this.importStatements) {
      this.stream.write(stmt);
      this.stream.write("\n");
    }

    this.writeNamedTypeImports();
    this.writeMappedScalarImports();

    if (this.hasAnyImports) {
      this.stream.write("\n");
    }

    this.writeCode();
  }

  /**
   * Hook for subclasses to register all imports before body generation.
   */
  protected prepareImports(): void { }

  protected abstract writeCode(): void;

  // ── Import helpers ──

  protected importFieldTypes(field: GraphQLField<unknown, unknown>): void {
    this.importType(field.type);
    for (const arg of field.args) {
      this.importType(arg.type);
    }
  }

  /**
   * Registers type imports by recursively unwrapping list/non-null wrappers.
   */
  protected importType(type: GraphQLType): void {
    if (this.importFinalized) {
      throw new Error("Cannot import after write phase has started");
    }
    const namedType = unwrapType(type);
    if (
      namedType instanceof GraphQLInputObjectType ||
      namedType instanceof GraphQLEnumType
    ) {
      this.importedTypes.add(namedType);
      return;
    }
    if (namedType instanceof GraphQLScalarType && this.options.scalarTypeMap) {
      const mapped = this.options.scalarTypeMap[namedType.name];
      if (typeof mapped !== "object") return;
      const set = this.importedScalarTypes.get(mapped.importSource) ?? new Set();
      set.add(mapped.typeName);
      this.importedScalarTypes.set(mapped.importSource, set);
    }
  }

  protected importStatement(statement: string): void {
    if (this.importFinalized) {
      throw new Error("Cannot import after write phase has started");
    }
    let stmt = statement.trimEnd();
    if (stmt.endsWith("\n")) stmt = stmt.slice(0, -1);
    if (!stmt.endsWith(";")) stmt += ";";
    this.importStatements.add(stmt);
  }

  protected importingBehavior(_type: GraphQLNamedType): ImportingBehavior {
    return "other_dir";
  }

  // ── Scope management ──

  protected enter(type: ScopeType, multiLines = false, prefix?: string): void {
    if (prefix) this.text(prefix);
    const [open] = SCOPE_BRACKETS[type];
    if (open) this.text(open);
    if (multiLines) this.text("\n");
    this.scopes.push({ type, multiLines, dirty: false });
  }

  protected leave(suffix?: string): void {
    const scope = this.scopes.pop();
    if (!scope) throw new Error("No scope to leave");
    if (scope.multiLines && !this.needIndent) this.text("\n");
    const [, close] = SCOPE_BRACKETS[scope.type];
    if (close) this.text(close);
    if (suffix) this.text(suffix);
  }

  protected scope(args: ScopeArgs, action: () => void): void {
    this.enter(args.type, args.multiLines === true, args.prefix);
    action();
    this.leave(args.suffix);
  }

  protected separator(value?: string): void {
    const scope = this.currentScope;
    if (scope.dirty) {
      if (value) {
        this.text(value);
      } else if (scope.type === "parameters" || scope.type === "generic") {
        this.text(", ");
      }
      if (scope.multiLines) this.text("\n");
    }
  }

  // ── Text output ──

  protected text(value: string): void {
    const lines = value.split("\n");
    lines.forEach((line, idx) => {
      if (line) {
        if (this.needIndent) {
          this.flushIndent();
          this.needIndent = false;
        }
        this.stream.write(line);
        this.currentScope.dirty = true;
      }
      if (idx < lines.length - 1) {
        this.stream.write("\n");
        this.needIndent = true;
      }
    });
  }

  protected str(value: string): void {
    this.text(`'${value}'`);
  }

  // ── Type references ──

  protected variableDecl(
    name: string,
    type: GraphQLType,
    overrideObjectTypeName?: string,
  ): void {
    this.text(name);
    if (!(type instanceof GraphQLNonNull)) this.text("?");
    this.text(": ");
    this.typeRef(type, overrideObjectTypeName);
  }

  /**
   * Renders a GraphQL type as TypeScript type syntax.
   */
  protected typeRef(
    type: GraphQLType,
    objectRender?:
      | string
      | ((
        type: GraphQLObjectType | GraphQLInterfaceType,
        field: GraphQLField<any, any>,
      ) => boolean),
  ): void {
    if (type instanceof GraphQLNonNull) {
      this.typeRef(type.ofType, objectRender);
      return;
    }
    if (type instanceof GraphQLList) {
      const arrayType = this.options.arrayEditable ? "Array" : "ReadonlyArray";
      this.typeApplication(arrayType, () => {
        this.typeRef(type.ofType, objectRender);
        if (!(type.ofType instanceof GraphQLNonNull)) this.text(" | undefined");
      });
      return;
    }
    if (type instanceof GraphQLScalarType) {
      const mapped =
        this.options.scalarTypeMap?.[type.name] ?? SCALAR_MAP[type.name];
      if (!mapped) throw new Error(`Unknown scalar type ${type.name}`);
      this.text(typeof mapped === "string" ? mapped : mapped.typeName);
      return;
    }
    if (
      type instanceof GraphQLEnumType ||
      type instanceof GraphQLInputObjectType
    ) {
      this.text(type.name);
      return;
    }
    if (
      type instanceof GraphQLObjectType ||
      type instanceof GraphQLInterfaceType ||
      type instanceof GraphQLUnionType
    ) {
      this.writeObjectLikeTypeRef(type, objectRender);
      return;
    }
    const neverType: never = type;
    throw new Error(`Unsupported GraphQL type ${(neverType as GraphQLType).toString()}`);
  }

  /**
   * Renders a GraphQL type in SDL notation, e.g. `[User!]!`.
   */
  protected gqlTypeRef(type: GraphQLType): void {
    if (type instanceof GraphQLNonNull) {
      this.gqlTypeRef(type.ofType);
      this.text("!");
      return;
    }
    if (type instanceof GraphQLList) {
      this.text("[");
      this.gqlTypeRef(type.ofType);
      this.text("]");
      return;
    }
    if (type instanceof GraphQLUnionType) {
      this.writeUnion(type.getTypes().map((itemType) => itemType.name));
      return;
    }
    this.text((type as GraphQLNamedType).name);
  }

  protected isUnderGlobalDir(): boolean {
    return false;
  }

  // ── Private ──

  private writeNamedTypeImports(): void {
    for (const importedType of this.importedTypes) {
      const behavior = this.importingBehavior(importedType);
      if (behavior === "self") continue;
      const from = this.resolveTypeImportPath(importedType, behavior);
      this.stream.write(`import type {${importedType.name}} from '${from}';\n`);
    }
  }

  private writeMappedScalarImports(): void {
    if (this.importedScalarTypes.size === 0) return;
    const sourcePrefix = this.isUnderGlobalDir() ? "../" : "../../";
    for (const [importSource, typeNames] of this.importedScalarTypes) {
      this.stream.write(
        `import type { ${[...typeNames].join(", ")} } from '${sourcePrefix}${importSource}';\n`,
      );
    }
  }

  protected typeApplication(typeName: string, renderTypeArg: () => void): void {
    this.text(`${typeName}<`);
    renderTypeArg();
    this.text(">");
  }

  private resolveTypeImportPath(
    importedType: GraphQLNamedType,
    behavior: Exclude<ImportingBehavior, "self">,
  ): string {
    if (behavior === "same_dir") return ".";
    const subDir = this.typeSubDir(importedType);
    return this.isUnderGlobalDir() ? `./${subDir}` : `../${subDir}`;
  }

  private typeSubDir(importedType: GraphQLNamedType): "inputs" | "enums" | "selections" {
    if (importedType instanceof GraphQLInputObjectType) return "inputs";
    if (importedType instanceof GraphQLEnumType) return "enums";
    return "selections";
  }

  private writeObjectLikeTypeRef(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    objectRender?:
      | string
      | ((
        type: GraphQLObjectType | GraphQLInterfaceType,
        field: GraphQLField<any, any>,
      ) => boolean),
  ): void {
    if (typeof objectRender === "string") {
      this.text(objectRender);
      return;
    }
    if (type instanceof GraphQLUnionType) {
      this.writeUnion(type.getTypes().map((itemType) => itemType.name));
      return;
    }
    if (typeof objectRender !== "function") {
      this.text(type.name);
      return;
    }
    this.scope({ type: "block", multiLines: true }, () => {
      for (const [fieldName, field] of Object.entries(type.getFields())) {
        if (!objectRender(type, field)) continue;
        this.separator(", ");
        this.text("readonly ");
        this.text(fieldName);
        this.text(": ");
        this.typeRef(field.type, objectRender);
      }
    });
  }

  private get hasAnyImports(): boolean {
    return (
      this.importStatements.size !== 0 ||
      this.importedTypes.size !== 0 ||
      this.importedScalarTypes.size !== 0
    );
  }

  private writeUnion(members: readonly string[]): void {
    this.enter("blank");
    for (const member of members) {
      this.separator(" | ");
      this.text(member);
    }
    this.leave();
  }

  private flushIndent(): void {
    for (const scope of this.scopes) {
      if (scope.multiLines) this.stream.write(this.indent);
    }
  }

  private get currentScope(): ScopeState {
    return this.scopes.at(-1) ?? GLOBAL_SCOPE;
  }
}

function unwrapType(type: GraphQLType): GraphQLNamedType {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return unwrapType(type.ofType);
  }
  return type as GraphQLNamedType;
}
