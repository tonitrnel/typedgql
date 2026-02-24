import {
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLUnionType,
} from "graphql";

type CompositeType =
  | GraphQLObjectType
  | GraphQLInterfaceType
  | GraphQLUnionType;

// ─── Helpers ─────────────────────────────────────────────────────────

/** Get-or-create a Set in a Map, then add a value to it. */
function addToSetMap<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Remove transitive (indirect) entries from the downcast map so that
 * each parent only lists its *direct* children.
 *
 * For example given A → B → C, the entry for A should only contain B,
 * not C (because C is reachable through B).
 */
function pruneTransitive(
  map: ReadonlyMap<CompositeType, Set<CompositeType>>,
): void {
  for (const [, children] of map) {
    removeReachable(children, children, map);
  }
}

function removeReachable(
  target: Set<CompositeType>,
  current: ReadonlySet<CompositeType>,
  map: ReadonlyMap<CompositeType, Set<CompositeType>>,
): void {
  for (const type of current) {
    // Don't delete from the initial set on the first call (target === current)
    if (target !== current) target.delete(type);
    const deeper = map.get(type);
    if (deeper) removeReachable(target, deeper, map);
  }
}

/** Invert a parent→children map into a child→parents map. */
function invertMap(
  map: ReadonlyMap<CompositeType, Set<CompositeType>>,
): Map<CompositeType, Set<CompositeType>> {
  const inverted = new Map<CompositeType, Set<CompositeType>>();
  for (const [parent, children] of map) {
    for (const child of children) {
      addToSetMap(inverted, child, parent);
    }
  }
  return inverted;
}

// ─── TypeHierarchyGraph ──────────────────────────────────────────────

export class TypeHierarchyGraph {
  /** parent → direct children (interface → implementors, union → members) */
  readonly downcastTypeMap: ReadonlyMap<CompositeType, Set<CompositeType>>;
  /** child → direct parents */
  readonly upcastTypeMap: ReadonlyMap<CompositeType, Set<CompositeType>>;

  constructor(schema: GraphQLSchema) {
    const downcast = new Map<CompositeType, Set<CompositeType>>();
    const typeMap = schema.getTypeMap();

    for (const typeName in typeMap) {
      if (typeName.startsWith("__")) continue;
      const type = typeMap[typeName]!;

      if (
        type instanceof GraphQLObjectType ||
        type instanceof GraphQLInterfaceType
      ) {
        for (const iface of type.getInterfaces()) {
          addToSetMap(downcast, iface, type);
        }
      }
      if (type instanceof GraphQLUnionType) {
        for (const member of type.getTypes()) {
          addToSetMap(downcast, type, member);
        }
      }
    }

    pruneTransitive(downcast);
    this.downcastTypeMap = downcast;
    this.upcastTypeMap = invertMap(downcast);
  }

  /** Walk ancestor types recursively, calling `callback` for each. */
  visitUpcastTypesRecursively(
    type: CompositeType,
    callback: (ancestor: CompositeType) => void,
  ): void {
    const parents = this.upcastTypeMap.get(type);
    if (!parents) return;
    for (const parent of parents) {
      callback(parent);
      this.visitUpcastTypesRecursively(parent, callback);
    }
  }
}
