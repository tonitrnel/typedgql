import { describe, it, expect } from "vitest";
import {
    GraphQLInterfaceType,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    GraphQLUnionType,
    GraphQLNonNull,
} from "graphql";
import { TypeHierarchyGraph } from "../type-hierarchy-graph";

// ─── Schema helpers ──────────────────────────────────────────────────

function fields() {
    return { id: { type: new GraphQLNonNull(GraphQLString) } };
}

function nameSet(
    map: ReadonlyMap<any, Set<any>>,
    key: any,
): string[] {
    return [...(map.get(key) ?? [])].map((t: any) => t.name).sort();
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("TypeHierarchyGraph", () => {
    it("builds downcast map for interface → implementors", () => {
        const iface = new GraphQLInterfaceType({ name: "Node", fields });
        const a = new GraphQLObjectType({
            name: "A",
            interfaces: [iface],
            fields,
        });
        const b = new GraphQLObjectType({
            name: "B",
            interfaces: [iface],
            fields,
        });
        const query = new GraphQLObjectType({
            name: "Query",
            fields: {
                a: { type: a },
                b: { type: b },
            },
        });
        const schema = new GraphQLSchema({ query, types: [iface, a, b] });
        const graph = new TypeHierarchyGraph(schema);

        expect(nameSet(graph.downcastTypeMap, iface)).toEqual(["A", "B"]);
    });

    it("builds upcast map (inverse of downcast)", () => {
        const iface = new GraphQLInterfaceType({ name: "Node", fields });
        const a = new GraphQLObjectType({
            name: "A",
            interfaces: [iface],
            fields,
        });
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { a: { type: a } },
        });
        const schema = new GraphQLSchema({ query, types: [iface, a] });
        const graph = new TypeHierarchyGraph(schema);

        expect(nameSet(graph.upcastTypeMap, a)).toEqual(["Node"]);
        // Node has no parents
        expect(graph.upcastTypeMap.get(iface)).toBeUndefined();
    });

    it("handles union → member relationships", () => {
        const a = new GraphQLObjectType({ name: "A", fields });
        const b = new GraphQLObjectType({ name: "B", fields });
        const union = new GraphQLUnionType({
            name: "AB",
            types: [a, b],
        });
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { ab: { type: union } },
        });
        const schema = new GraphQLSchema({ query, types: [a, b, union] });
        const graph = new TypeHierarchyGraph(schema);

        expect(nameSet(graph.downcastTypeMap, union)).toEqual(["A", "B"]);
        expect(nameSet(graph.upcastTypeMap, a)).toEqual(["AB"]);
        expect(nameSet(graph.upcastTypeMap, b)).toEqual(["AB"]);
    });

    it("prunes transitive entries from downcast map", () => {
        // Hierarchy: Root → Mid → Leaf
        // Root's downcast should only contain Mid (not Leaf)
        const root = new GraphQLInterfaceType({ name: "Root", fields });
        const mid = new GraphQLInterfaceType({
            name: "Mid",
            interfaces: [root],
            fields,
        });
        const leaf = new GraphQLObjectType({
            name: "Leaf",
            interfaces: [root, mid],
            fields,
        });
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { leaf: { type: leaf } },
        });
        const schema = new GraphQLSchema({ query, types: [root, mid, leaf] });
        const graph = new TypeHierarchyGraph(schema);

        // Root directly contains only Mid (Leaf is pruned as transitive)
        expect(nameSet(graph.downcastTypeMap, root)).toEqual(["Mid"]);
        // Mid directly contains Leaf
        expect(nameSet(graph.downcastTypeMap, mid)).toEqual(["Leaf"]);
    });

    it("visitUpcastTypesRecursively walks all ancestors", () => {
        const root = new GraphQLInterfaceType({ name: "Root", fields });
        const mid = new GraphQLInterfaceType({
            name: "Mid",
            interfaces: [root],
            fields,
        });
        const leaf = new GraphQLObjectType({
            name: "Leaf",
            interfaces: [root, mid],
            fields,
        });
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { leaf: { type: leaf } },
        });
        const schema = new GraphQLSchema({ query, types: [root, mid, leaf] });
        const graph = new TypeHierarchyGraph(schema);

        const visited: string[] = [];
        graph.visitUpcastTypesRecursively(leaf, (t) => visited.push(t.name));
        expect(visited.sort()).toEqual(["Mid", "Root"]);
    });

    it("returns empty maps for schema with no composite relations", () => {
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { hello: { type: GraphQLString } },
        });
        const schema = new GraphQLSchema({ query });
        const graph = new TypeHierarchyGraph(schema);

        // Query itself doesn't implement interfaces, so maps should be empty
        expect(graph.downcastTypeMap.size).toBe(0);
        expect(graph.upcastTypeMap.size).toBe(0);
    });

    it("visitUpcastTypesRecursively is no-op for types with no parents", () => {
        const query = new GraphQLObjectType({
            name: "Query",
            fields: { hello: { type: GraphQLString } },
        });
        const schema = new GraphQLSchema({ query });
        const graph = new TypeHierarchyGraph(schema);

        const visited: string[] = [];
        graph.visitUpcastTypesRecursively(query, (t) => visited.push(t.name));
        expect(visited).toEqual([]);
    });
});
