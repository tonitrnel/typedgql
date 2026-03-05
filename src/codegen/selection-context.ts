/**
 * Context shared across selection writers during code generation.
 *
 * Holds the GraphQL schema, type hierarchy graph, and various
 * type classification sets that selection writers need to generate
 * correct TypeScript code for each GraphQL composite type.
 */

import {
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import { TypeHierarchyGraph } from "./type-hierarchy-graph";

export interface SelectionContext {
  /** The parsed GraphQL schema. */
  readonly schema: GraphQLSchema;

  /** Graph of upcast/downcast relationships between composite types. */
  readonly typeHierarchy: TypeHierarchyGraph;

  /** All composite types that will have selections generated. */
  readonly selectionTypes: ReadonlyArray<
    GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType
  >;

  /** Types identified as entities (have an ID field). */
  readonly entityTypes: ReadonlySet<GraphQLType>;

  /** Types identified as embedded (no ID field). */
  readonly embeddedTypes: ReadonlySet<GraphQLType>;

  /** Types that can trigger queries (Query type or entities with >1 field). */
  readonly triggerableTypes: ReadonlySet<GraphQLType>;

  /** Map from composite type to its designated ID field. */
  readonly idFieldMap: ReadonlyMap<
    GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    GraphQLField<any, any>
  >;

  /** Types containing at least one field with arguments. */
  readonly typesWithParameterizedField: ReadonlySet<
    GraphQLObjectType | GraphQLInterfaceType
  >;
}
