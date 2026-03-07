export type JSImportKind = "type" | "value";

export interface JSImportSpec {
  readonly source: string;
  readonly kind: JSImportKind;
}

export type JSImportSourceMap<TSymbol extends string = string> = Readonly<
  Record<TSymbol, JSImportSpec>
>;

/**
 * Shared import collector for codegen writers.
 *
 * Responsibilities:
 * - normalize imports by source
 * - deduplicate symbols
 * - keep emitted import statements stable (sorted)
 */
export class JSImportCollector<TSymbol extends string = string> {
  private readonly typeBySource = new Map<string, Set<string>>();
  private readonly valueBySource = new Map<string, Set<string>>();
  private readonly sideEffects = new Set<string>();

  constructor(
    private readonly sink: (stmt: string) => void,
    private readonly sourceMap: JSImportSourceMap<TSymbol>,
  ) {}

  useMapped(symbol: TSymbol): void {
    const spec = this.sourceMap[symbol];
    if (spec.kind === "type") {
      this.useType(spec.source, symbol);
    } else {
      this.useValue(spec.source, symbol);
    }
  }

  useType(source: string, symbol: string): void {
    this.collect(this.typeBySource, source, symbol);
  }

  useValue(source: string, symbol: string): void {
    this.collect(this.valueBySource, source, symbol);
  }

  useSideEffect(source: string): void {
    this.sideEffects.add(source);
  }

  emit(): void {
    for (const [source, symbols] of this.sorted(this.typeBySource)) {
      this.sink(
        `import type { ${Array.from(symbols).sort().join(", ")} } from '${source}';`,
      );
    }
    for (const [source, symbols] of this.sorted(this.valueBySource)) {
      this.sink(
        `import { ${Array.from(symbols).sort().join(", ")} } from '${source}';`,
      );
    }
    for (const source of Array.from(this.sideEffects).sort()) {
      this.sink(`import '${source}';`);
    }
  }

  private collect(
    map: Map<string, Set<string>>,
    source: string,
    symbol: string,
  ): void {
    const set = map.get(source) ?? new Set<string>();
    set.add(symbol);
    map.set(source, set);
  }

  private sorted(
    map: Map<string, Set<string>>,
  ): Array<[source: string, symbols: Set<string>]> {
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }
}

const RUNTIME_ENTRY_SOURCE = "../../dist/index.mjs";
const TYPE_HIERARCHY_SOURCE = "../type-hierarchy";
const ENUM_INPUT_METADATA_SOURCE = "../enum-input-metadata";
const SCALAR_TYPES_SOURCE = "../scalar-types";
export const SCALAR_TYPES_NAMESPACE = "UserScalarTypes";

export const CODEGEN_IMPORT_SOURCE_MAP = {
  AcceptableVariables: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  UnresolvedVariables: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  DirectiveArgs: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  Selection: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  ShapeOf: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  VariablesOf: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  ValueOrThunk: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  FragmentSpread: { source: RUNTIME_ENTRY_SOURCE, kind: "type" },
  createSelection: { source: RUNTIME_ENTRY_SOURCE, kind: "value" },
  withOperationName: { source: RUNTIME_ENTRY_SOURCE, kind: "value" },
  createSchemaType: { source: RUNTIME_ENTRY_SOURCE, kind: "value" },
  registerSchemaTypeFactory: { source: RUNTIME_ENTRY_SOURCE, kind: "value" },
  resolveRegisteredSchemaType: { source: RUNTIME_ENTRY_SOURCE, kind: "value" },
  ENUM_INPUT_METADATA: { source: ENUM_INPUT_METADATA_SOURCE, kind: "value" },
  SCALAR_TYPE_NAMESPACE: { source: SCALAR_TYPES_SOURCE, kind: "type" },
  WithTypeName: { source: TYPE_HIERARCHY_SOURCE, kind: "type" },
  ImplementationType: { source: TYPE_HIERARCHY_SOURCE, kind: "type" },
  EnumInputMetadataBuilder: {
    source: "../dist/index.mjs",
    kind: "value",
  },
} as const satisfies JSImportSourceMap;

export type CodegenImportSymbol = keyof typeof CODEGEN_IMPORT_SOURCE_MAP;

export type SelectionImportSymbol = Extract<
  CodegenImportSymbol,
  | "AcceptableVariables"
  | "UnresolvedVariables"
  | "DirectiveArgs"
  | "Selection"
  | "ShapeOf"
  | "VariablesOf"
  | "ValueOrThunk"
  | "FragmentSpread"
  | "createSelection"
  | "withOperationName"
  | "createSchemaType"
  | "registerSchemaTypeFactory"
  | "resolveRegisteredSchemaType"
  | "ENUM_INPUT_METADATA"
  | "WithTypeName"
  | "ImplementationType"
>;

export type EnumInputMetadataWriterImportSymbol = Extract<
  CodegenImportSymbol,
  "EnumInputMetadataBuilder"
>;
