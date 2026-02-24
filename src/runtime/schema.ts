// ─── Type Categories ──────────────────────────────────────────────────

export type SchemaTypeCategory = "OBJECT" | "EMBEDDED" | "CONNECTION" | "EDGE";
export type SchemaFieldCategory = "ID" | "SCALAR" | "REFERENCE" | "LIST" | "CONNECTION";

// ─── Schema Type & Field (plain readonly interfaces) ─────────────────

export interface SchemaType<E extends string = string> {
  readonly name: E;
  readonly category: SchemaTypeCategory;
  readonly interfaces: readonly SchemaType[];
  readonly ownFields: ReadonlyMap<string, SchemaField>;
  readonly fields: ReadonlyMap<string, SchemaField>;
}

export interface SchemaField {
  readonly name: string;
  readonly category: SchemaFieldCategory;
  readonly argGraphQLTypeMap: ReadonlyMap<string, string>;
  readonly targetTypeName?: string;
  readonly connectionTypeName?: string;
  readonly edgeTypeName?: string;
  readonly isPlural: boolean;
  readonly isAssociation: boolean;
  readonly isFunction: boolean;
  readonly isUndefinable: boolean;
}

const SCHEMA_TYPE_REGISTRY = new Map<string, SchemaType>();
const SCHEMA_TYPE_FACTORY_REGISTRY = new Map<string, () => SchemaType>();
const SCHEMA_TYPE_RESOLVING = new Set<string>();

export function resolveRegisteredSchemaType(typeName: string): SchemaType | undefined {
  const registered = SCHEMA_TYPE_REGISTRY.get(typeName);
  if (registered) {
    return registered;
  }

  const factory = SCHEMA_TYPE_FACTORY_REGISTRY.get(typeName);
  if (!factory) {
    return undefined;
  }
  if (SCHEMA_TYPE_RESOLVING.has(typeName)) {
    throw new Error(`Circular schema factory resolution detected for "${typeName}"`);
  }

  SCHEMA_TYPE_RESOLVING.add(typeName);
  try {
    const created = factory();
    registerSchemaType(created);
  } finally {
    SCHEMA_TYPE_RESOLVING.delete(typeName);
  }

  return SCHEMA_TYPE_REGISTRY.get(typeName);
}

export function registerSchemaTypeFactory(typeName: string, factory: () => SchemaType) {
  if (!SCHEMA_TYPE_FACTORY_REGISTRY.has(typeName)) {
    SCHEMA_TYPE_FACTORY_REGISTRY.set(typeName, factory);
  }
}

// ─── Field Descriptor (input to factory) ──────────────────────────────

type FieldDescriptor =
  | string
  | {
    readonly name: string;
    readonly category: SchemaFieldCategory;
    readonly undefinable?: boolean;
    readonly argGraphQLTypeMap?: { readonly [key: string]: string };
    readonly targetTypeName?: string;
    readonly connectionTypeName?: string;
    readonly edgeTypeName?: string;
  };

// ─── Factory ────────────────────────────────────────────────────────

export function createSchemaType<E extends string>(
  name: E,
  category: SchemaTypeCategory,
  superTypes: readonly SchemaType[],
  declaredFields: readonly FieldDescriptor[],
): SchemaType<E> {
  const declaredFieldMap = new Map<string, SchemaField>();

  for (const desc of declaredFields) {
    if (typeof desc === "string") {
      declaredFieldMap.set(desc, buildField(desc, "SCALAR", new Map()));
    } else {
      const argMap = new Map<string, string>();
      if (desc.argGraphQLTypeMap) {
        for (const k in desc.argGraphQLTypeMap) {
          argMap.set(k, desc.argGraphQLTypeMap[k]!);
        }
      }
      declaredFieldMap.set(
        desc.name,
        buildField(desc.name, desc.category, argMap, desc.targetTypeName, desc.connectionTypeName, desc.edgeTypeName, desc.undefinable),
      );
    }
  }

  validateType(name, category, declaredFieldMap, superTypes);

  // Lazily compute merged fields (own + inherited)
  let _fields: ReadonlyMap<string, SchemaField> | undefined;

  const result: SchemaType<E> = {
    name,
    category,
    interfaces: superTypes,
    ownFields: declaredFieldMap,
    get fields(): ReadonlyMap<string, SchemaField> {
      if (!_fields) {
        _fields = superTypes.length === 0
          ? declaredFieldMap
          : collectFields(result);
      }
      return _fields;
    },
  };

  registerSchemaType(result);
  return result;
}

// ─── Internal helpers ─────────────────────────────────────────────────

function buildField(
  name: string,
  category: SchemaFieldCategory,
  argGraphQLTypeMap: ReadonlyMap<string, string>,
  targetTypeName?: string,
  connectionTypeName?: string,
  edgeTypeName?: string,
  undefinable?: boolean,
): SchemaField {
  const isPlural = category === "LIST" || category === "CONNECTION";
  const isAssociation = category === "REFERENCE" || isPlural;

  return {
    name,
    category,
    argGraphQLTypeMap,
    targetTypeName,
    connectionTypeName,
    edgeTypeName,
    isPlural,
    isAssociation,
    isFunction: argGraphQLTypeMap.size !== 0 || isAssociation || targetTypeName !== undefined,
    isUndefinable: undefinable ?? false,
  };
}

function validateType(
  name: string,
  category: SchemaTypeCategory,
  declaredFields: ReadonlyMap<string, SchemaField>,
  superTypes: readonly SchemaType[],
) {
  if (category === "CONNECTION") {
    const edges = declaredFields.get("edges");
    if (!edges) throw new Error(`Type "${name}": CONNECTION must have an "edges" field`);
    if (edges.category !== "LIST") throw new Error(`Type "${name}": CONNECTION "edges" must be LIST`);
  } else if (category === "EDGE") {
    const node = declaredFields.get("node");
    if (!node) throw new Error(`Type "${name}": EDGE must have a "node" field`);
    if (node.category !== "REFERENCE") throw new Error(`Type "${name}": EDGE "node" must be REFERENCE`);
    const cursor = declaredFields.get("cursor");
    if (cursor && cursor.category !== "SCALAR") throw new Error(`Type "${name}": EDGE "cursor" must be SCALAR`);
  }

  if ((category === "CONNECTION" || category === "EDGE") && superTypes.length !== 0) {
    throw new Error(`Type "${name}": ${category} cannot have super types`);
  }
}

function collectFields(type: SchemaType): ReadonlyMap<string, SchemaField> {
  const result = new Map<string, SchemaField>();
  _collect(type, result);
  return result;
}

function _collect(type: SchemaType, out: Map<string, SchemaField>) {
  for (const [name, field] of type.ownFields) {
    out.set(name, field);
  }
  for (const superType of type.interfaces) {
    _collect(superType, out);
  }
}

function registerSchemaType(type: SchemaType) {
  const existing = SCHEMA_TYPE_REGISTRY.get(type.name);
  if (!existing) {
    SCHEMA_TYPE_REGISTRY.set(type.name, type);
    return;
  }

  if (existing.ownFields.size < type.ownFields.size) {
    SCHEMA_TYPE_REGISTRY.set(type.name, type);
  }
}
