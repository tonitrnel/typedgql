// ─── Type Categories ──────────────────────────────────────────────────

/**
 * Runtime-level classification for GraphQL composite types.
 *
 * - OBJECT:
 *   Represents identity-bearing types (typically with an id-like field) that are
 *   treated as independently addressable nodes in selection/proxy logic.
 * - EMBEDDED:
 *   Represents value-like types without independent identity; they are selected
 *   as nested structures and are not treated as standalone entity nodes.
 */
export type SchemaTypeCategory = "OBJECT" | "EMBEDDED";

/**
 * Runtime-level classification for fields in a schema type.
 *
 * - ID:
 *   Identity field of an OBJECT-like node (used for entity identity semantics).
 * - SCALAR:
 *   Leaf/value field with no nested selection.
 * - REFERENCE:
 *   Single-valued association to another composite type (requires child selection).
 * - LIST:
 *   Multi-valued association to another composite type (requires child selection).
 */
export type SchemaFieldCategory = "ID" | "SCALAR" | "REFERENCE" | "LIST";

// ─── Schema Type & Field (plain readonly interfaces) ─────────────────

/**
 * Normalized runtime representation of one GraphQL composite type.
 */
export interface SchemaType<E extends string = string> {
  /** GraphQL type name. */
  readonly name: E;
  /** Coarse runtime category used by selection/proxy behavior. */
  readonly category: SchemaTypeCategory;
  /** Directly implemented interfaces / declared super types. */
  readonly interfaces: readonly SchemaType[];
  /** Fields declared on this type itself (excluding inherited fields). */
  readonly ownFields: ReadonlyMap<string, SchemaField>;
  /** Effective fields (own fields plus inherited/interface fields). */
  readonly fields: ReadonlyMap<string, SchemaField>;
}

/**
 * Normalized runtime representation of one field on a schema type.
 */
export interface SchemaField {
  /** Field name as exposed by GraphQL. */
  readonly name: string;
  /** Coarse runtime field category. */
  readonly category: SchemaFieldCategory;
  /** GraphQL argument type map keyed by argument name (SDL form, e.g. `ID!`). */
  readonly argGraphQLTypeMap: ReadonlyMap<string, string>;
  /** Target GraphQL type name when this field points to another composite type. */
  readonly targetTypeName?: string;
  /** Whether this field is multi-valued. */
  readonly isPlural: boolean;
  /** Whether this field is an association/reference field. */
  readonly isAssociation: boolean;
  /** Whether runtime treats this field as function-like (args or association). */
  readonly isFunction: boolean;
  /** Whether this field may be omitted in generated runtime builders. */
  readonly isUndefinable: boolean;
}

const SCHEMA_TYPE_REGISTRY = new Map<string, SchemaType>();
const SCHEMA_TYPE_FACTORY_REGISTRY = new Map<string, () => SchemaType>();
const SCHEMA_TYPE_RESOLVING = new Set<string>();

export function resolveRegisteredSchemaType(
  typeName: string,
): SchemaType | undefined {
  const registered = SCHEMA_TYPE_REGISTRY.get(typeName);
  if (registered) {
    return registered;
  }

  const factory = SCHEMA_TYPE_FACTORY_REGISTRY.get(typeName);
  if (!factory) {
    return undefined;
  }
  if (SCHEMA_TYPE_RESOLVING.has(typeName)) {
    throw new Error(
      `Circular schema factory resolution detected for "${typeName}"`,
    );
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

export function registerSchemaTypeFactory(
  typeName: string,
  factory: () => SchemaType,
) {
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
        buildField(
          desc.name,
          desc.category,
          argMap,
          desc.targetTypeName,
          desc.undefinable,
        ),
      );
    }
  }

  // Lazily compute merged fields (own + inherited)
  let _fields: ReadonlyMap<string, SchemaField> | undefined;

  const result: SchemaType<E> = {
    name,
    category,
    interfaces: superTypes,
    ownFields: declaredFieldMap,
    get fields(): ReadonlyMap<string, SchemaField> {
      if (!_fields) {
        _fields =
          superTypes.length === 0 ? declaredFieldMap : collectFields(result);
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
  undefinable?: boolean,
): SchemaField {
  const isPlural = category === "LIST";
  const isAssociation = category === "REFERENCE" || isPlural;

  return {
    name,
    category,
    argGraphQLTypeMap,
    targetTypeName,
    isPlural,
    isAssociation,
    isFunction:
      argGraphQLTypeMap.size !== 0 ||
      isAssociation ||
      targetTypeName !== undefined,
    isUndefinable: undefinable ?? false,
  };
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
