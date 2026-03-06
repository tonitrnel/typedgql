import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createSelection, createSchemaType } from "../proxy";
import { EnumInputMetadataBuilder } from "../enum-metadata";
import { FragmentRef } from "../types";
import type { Selection } from "../types";

const enumInputMetadata = new EnumInputMetadataBuilder().build();

function makeType(
    name: string,
    scalarFields: string[],
    assocFields: { name: string; targetTypeName: string }[] = [],
) {
    return createSchemaType(
        name,
        "OBJECT",
        [],
        [
            ...scalarFields,
            ...assocFields.map((f) => ({
                name: f.name,
                category: "REFERENCE" as const,
                targetTypeName: f.targetTypeName,
            })),
        ],
    );
}

describe("标量字段链式选择", () => {
    it("selecting a scalar field increases fieldMap size by 1", () => {
        const scalarNames = ["id", "name", "status", "priority", "createdAt"];

        fc.assert(
            fc.property(
                fc.subarray(scalarNames, { minLength: 1 }),
                fc.integer({ min: 0, max: scalarNames.length - 1 }),
                (fields, idx) => {
                    if (fields.length === 0) return;
                    const fieldName = fields[idx % fields.length]!;
                    const schemaType = makeType("TestType", fields);
                    const selection = createSelection<
                        string,
                        Selection<string, object, object>
                    >(schemaType, enumInputMetadata, undefined);

                    const before = selection.fieldMap.size;
                    const after = (selection as any)[fieldName].fieldMap.size;

                    expect(after).toBe(before + 1);
                },
            ),
        );
    });

    it("selected scalar field appears in fieldMap", () => {
        const scalarNames = ["id", "name", "status"];

        fc.assert(
            fc.property(
                fc.subarray(scalarNames, { minLength: 1 }),
                fc.integer({ min: 0, max: scalarNames.length - 1 }),
                (fields, idx) => {
                    if (fields.length === 0) return;
                    const fieldName = fields[idx % fields.length]!;
                    const schemaType = makeType("TestType", fields);
                    const selection = createSelection<
                        string,
                        Selection<string, object, object>
                    >(schemaType, enumInputMetadata, undefined);

                    const result = (selection as any)[fieldName];
                    expect(result.fieldMap.has(fieldName)).toBe(true);
                },
            ),
        );
    });
});

describe("关联字段回调选择", () => {
    it("callback parameter can chain child scalar fields from registered schema", () => {
        makeType("Comment", ["id", "body", "createdAt"]);
        const postType = makeType(
            "Post",
            ["id", "title"],
            [{ name: "comments", targetTypeName: "Comment" }],
        );

        const postSelection = createSelection<string, Selection<string, object, object>>(
            postType,
            enumInputMetadata,
            undefined,
        );

        const result = (postSelection as any).comments((comment: any) => comment.id.body);
        const commentsField = result.fieldMap.get("comments");
        expect(commentsField).toBeDefined();
        const childFieldMap = commentsField!.childSelections![0]!.fieldMap;
        expect(childFieldMap.has("id")).toBe(true);
        expect(childFieldMap.has("body")).toBe(true);
    });

    it("association field auto-parameterizes required args when omitted", () => {
        const postType = makeType("Post", ["id", "title"]);
        const queryType = createSchemaType(
            "Query",
            "OBJECT",
            [],
            [
                {
                    name: "post",
                    category: "REFERENCE",
                    targetTypeName: "Post",
                    argGraphQLTypeMap: { id: "ID!" },
                },
            ],
        );

        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).post((post: any) => post.id.title);
        const postField = result.fieldMap.get("post");
        expect(postField).toBeDefined();
        expect(postField!.args).toEqual({ id: expect.anything() });
        expect(result.toString()).toContain("post(id: $id)");
    });

    it("association field does not auto-parameterize optional args", () => {
        const postType = makeType("Post", ["id", "title"]);
        const queryType = createSchemaType(
            "Query",
            "OBJECT",
            [],
            [
                {
                    name: "posts",
                    category: "LIST",
                    targetTypeName: "Post",
                    argGraphQLTypeMap: { limit: "Int", offset: "Int" },
                },
            ],
        );

        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).posts((post: any) => post.id.title);
        const postsField = result.fieldMap.get("posts");
        expect(postsField).toBeDefined();
        expect(postsField!.args).toBeUndefined();
    });

    it("selecting an association field via callback includes it in fieldMap", () => {
        const childScalars = ["id", "role", "content"];

        fc.assert(
            fc.property(
                fc.subarray(childScalars, { minLength: 1 }),
                fc.integer({ min: 0, max: childScalars.length - 1 }),
                (childFields, idx) => {
                    if (childFields.length === 0) return;
                    const selectedChild = childFields[idx % childFields.length]!;

                    const childType = makeType("ChildType", childFields);
                    const parentType = makeType(
                        "ParentType",
                        ["id"],
                        [{ name: "items", targetTypeName: "ChildType" }],
                    );

                    const childSelection = createSelection<
                        string,
                        Selection<string, object, object>
                    >(childType, enumInputMetadata, undefined);

                    const parentSelection = createSelection<
                        string,
                        Selection<string, object, object>
                    >(parentType, enumInputMetadata, undefined);

                    const result = (parentSelection as any).items(
                        (_c: any) => (childSelection as any)[selectedChild],
                    );

                    expect(result.fieldMap.has("items")).toBe(true);
                    const itemsField = result.fieldMap.get("items");
                    expect(itemsField?.childSelections).toBeDefined();
                    expect(itemsField!.childSelections!.length).toBeGreaterThan(0);
                },
            ),
        );
    });

    it("callback-selected child fields are reflected in childSelections", () => {
        const childType = makeType("Chat", ["id", "role", "message"]);
        const parentType = makeType(
            "Task",
            ["id", "status"],
            [{ name: "chats", targetTypeName: "Chat" }],
        );

        const childSelection = createSelection<string, Selection<string, object, object>>(
            childType, enumInputMetadata, undefined,
        );
        const parentSelection = createSelection<string, Selection<string, object, object>>(
            parentType, enumInputMetadata, undefined,
        );

        const result = (parentSelection as any).chats(
            (_c: any) => (childSelection as any).id.role,
        );

        const chatsField = result.fieldMap.get("chats");
        expect(chatsField).toBeDefined();
        expect(chatsField!.childSelections).toBeDefined();
        const childFieldMap = chatsField!.childSelections![0]!.fieldMap;
        expect(childFieldMap.has("id")).toBe(true);
        expect(childFieldMap.has("role")).toBe(true);
    });

    it("$use(fragmentRef) embeds named fragment", () => {
        const childType = makeType("Chat", ["id", "role"]);
        const parentType = makeType(
            "Task",
            ["id", "status"],
            [{ name: "chats", targetTypeName: "Chat" }],
        );

        const childSelection = createSelection<string, Selection<string, object, object>>(
            childType, enumInputMetadata, undefined,
        );
        const parentSelection = createSelection<string, Selection<string, object, object>>(
            parentType, enumInputMetadata, undefined,
        );

        const fragment = new FragmentRef("chatFields", (childSelection as any).id.role);
        const result = (parentSelection as any).$use(fragment);
        expect(result.fieldMap.has("... chatFields")).toBe(true);
    });

    it("$use accepts thunk fragment value", () => {
        const childType = makeType("ChatThunk", ["id"]);
        const parentType = makeType(
            "TaskThunk",
            ["id"],
            [{ name: "chat", targetTypeName: "ChatThunk" }],
        );
        const childSelection = createSelection<string, Selection<string, object, object>>(
            childType,
            enumInputMetadata,
            undefined,
        );
        const parentSelection = createSelection<string, Selection<string, object, object>>(
            parentType,
            enumInputMetadata,
            undefined,
        );

        const fragment = new FragmentRef("chatThunkFields", (childSelection as any).id);
        const result = (parentSelection as any).$use(() => fragment);
        expect(result.fieldMap.has("... chatThunkFields")).toBe(true);
    });

    it("$directive() applies to selection when there is no preceding field", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("Root", ["id", "name"]),
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).$directive("include", { if: true });
        expect(result.directiveMap.has("include")).toBe(true);
    });

    it("$directive() applies to last field and $include/$skip are available", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("Root", ["id", "name"]),
            enumInputMetadata,
            undefined,
        );

        const withFieldDirective = (selection as any).id.$directive("deprecated", { reason: "x" });
        const idField = withFieldDirective.fieldMap.get("id");
        expect(idField?.fieldOptionsValue?.directives.has("deprecated")).toBe(true);

        const withInclude = (selection as any).name.$include(true);
        const nameField = withInclude.fieldMap.get("name");
        expect(nameField?.fieldOptionsValue?.directives.has("include")).toBe(true);

        const withSkip = (selection as any).name.$skip(true);
        const nameFieldSkip = withSkip.fieldMap.get("name");
        expect(nameFieldSkip?.fieldOptionsValue?.directives.has("skip")).toBe(true);
    });

    it("field-level directives are appended by name and preserve existing args/child", () => {
        const userType = makeType("DirUser", ["id", "name"]);
        const queryType = createSchemaType(
            "DirQuery",
            "OBJECT",
            [],
            [
                {
                    name: "user",
                    category: "REFERENCE",
                    targetTypeName: "DirUser",
                    argGraphQLTypeMap: { id: "ID!" },
                },
            ],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any)
            .user({ id: "u1" }, (u: any) => u.id.name)
            .$directive("cacheControl", { maxAge: 60 })
            .$directive("auth", { role: "ADMIN" });

        const userField = result.fieldMap.get("user");
        expect(userField?.args).toEqual({ id: "u1" });
        const childMap = userField?.childSelections?.[0]?.fieldMap;
        expect(childMap?.has("id")).toBe(true);
        expect(childMap?.has("name")).toBe(true);
        expect(userField?.fieldOptionsValue?.directives.get("cacheControl")).toEqual({ maxAge: 60 });
        expect(userField?.fieldOptionsValue?.directives.get("auth")).toEqual({ role: "ADMIN" });
    });

    it("$include/$skip apply to selection when there is no preceding field", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("RootIncludeSkip", ["id"]),
            enumInputMetadata,
            undefined,
        );

        const withInclude = (selection as any).$include(true);
        expect(withInclude.directiveMap.get("include")).toEqual({ if: true });

        const withSkip = (selection as any).$skip(false);
        expect(withSkip.directiveMap.get("skip")).toEqual({ if: false });
    });

    it("$alias throws without a preceding field", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("RootAliasError", ["id"]),
            enumInputMetadata,
            undefined,
        );

        expect(() => (selection as any).$alias("x")).toThrow(
            "$alias requires a preceding field selection",
        );
    });

    it("$alias works even when the last field was removed", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("RootAliasAfterOmit", ["id", "name"]),
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).id.$omit("id").$alias("idAlias");
        const idAliasField = result.fieldMap.get("idAlias");
        expect(idAliasField?.name).toBe("id");
        expect(idAliasField?.fieldOptionsValue?.alias).toBe("idAlias");
    });

    it("scalar fields with args use method handler and support options callback", () => {
        const queryType = createSchemaType(
            "RootMethod",
            "OBJECT",
            [],
            [
                {
                    name: "search",
                    category: "SCALAR",
                    argGraphQLTypeMap: { q: "String!", limit: "Int" },
                },
            ],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );

        const withAutoArgs = (selection as any).search();
        expect(withAutoArgs.toString()).toContain("search(q: $q)");

        const withOptions = (selection as any).search(
            { q: "abc", limit: 1 },
            (opts: any) => opts.alias("quickSearch").directive("include", { if: true }),
        );
        const field = withOptions.fieldMap.get("quickSearch");
        expect(field?.name).toBe("search");
        expect(field?.fieldOptionsValue?.directives.get("include")).toEqual({ if: true });
    });

    it("regular method call accepts SelectionImpl argument as child", () => {
        const childType = makeType("MethodChild", ["id"]);
        const queryType = createSchemaType(
            "RootMethodChild",
            "OBJECT",
            [],
            [
                {
                    name: "compute",
                    category: "SCALAR",
                    argGraphQLTypeMap: { q: "String!" },
                },
            ],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );
        const childSelection = createSelection<string, Selection<string, object, object>>(
            childType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).compute(
            { q: "x" },
            (childSelection as any).id,
        );
        const computeField = result.fieldMap.get("compute");
        expect(computeField?.childSelections?.[0]?.fieldMap.has("id")).toBe(true);
    });

    it("association fields fail fast when target type is invalid", () => {
        const missingTargetType = createSchemaType(
            "RootMissingTarget",
            "OBJECT",
            [],
            [{ name: "badRef", category: "REFERENCE" }],
        );
        const missingTargetSelection = createSelection<string, Selection<string, object, object>>(
            missingTargetType,
            enumInputMetadata,
            undefined,
        );
        expect(() => (missingTargetSelection as any).badRef((x: any) => x.id)).toThrow(
            'Field "badRef" has no target type',
        );

        const unresolvedTargetType = createSchemaType(
            "RootUnresolvedTarget",
            "OBJECT",
            [],
            [
                {
                    name: "badRef",
                    category: "REFERENCE",
                    targetTypeName: "NeverRegisteredType",
                },
            ],
        );
        const unresolvedTargetSelection = createSelection<string, Selection<string, object, object>>(
            unresolvedTargetType,
            enumInputMetadata,
            undefined,
        );
        expect(() => (unresolvedTargetSelection as any).badRef((x: any) => x.id)).toThrow(
            'Cannot resolve schema type "NeverRegisteredType" for field "badRef" on "RootUnresolvedTarget"',
        );
    });

    it("association field requires child selection", () => {
        makeType("AssocChild", ["id"]);
        const queryType = createSchemaType(
            "AssocRequireChildRoot",
            "OBJECT",
            [],
            [
                {
                    name: "child",
                    category: "REFERENCE",
                    targetTypeName: "AssocChild",
                },
            ],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );

        expect(() => (selection as any).child()).toThrow(
            'Field "child" requires a child selection',
        );
    });

    it("association field accepts direct SelectionImpl child", () => {
        const childType = makeType("AssocDirectChild", ["id", "name"]);
        const queryType = createSchemaType(
            "AssocDirectRoot",
            "OBJECT",
            [],
            [
                {
                    name: "child",
                    category: "REFERENCE",
                    targetTypeName: "AssocDirectChild",
                },
            ],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            queryType,
            enumInputMetadata,
            undefined,
        );
        const childSelection = createSelection<string, Selection<string, object, object>>(
            childType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).child((childSelection as any).id.name);
        const childField = result.fieldMap.get("child");
        expect(childField?.childSelections?.[0]?.fieldMap.has("id")).toBe(true);
        expect(childField?.childSelections?.[0]?.fieldMap.has("name")).toBe(true);
    });

    it("proxy exposes schemaType via property access", () => {
        const rootType = makeType("SchemaTypeAccessRoot", ["id"]);
        const selection = createSelection<string, Selection<string, object, object>>(
            rootType,
            enumInputMetadata,
            undefined,
        );

        expect((selection as any).schemaType.name).toBe("SchemaTypeAccessRoot");
    });

    it("$omit ignores non-string arguments", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("RootOmitNonString", ["id", "name"]),
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).id.name.$omit(123, { bad: true }, "id");
        expect(result.fieldMap.has("id")).toBe(false);
        expect(result.fieldMap.has("name")).toBe(true);
    });

    it("$directive after omitting the last field still rewrites field options", () => {
        const selection = createSelection<string, Selection<string, object, object>>(
            makeType("RootDirectiveAfterOmit", ["id"]),
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).id.$omit("id").$directive("include", { if: true });
        const idField = result.fieldMap.get("id");
        expect(idField?.name).toBe("id");
        expect(idField?.fieldOptionsValue?.directives.get("include")).toEqual({ if: true });
    });

    it("inherited function field does not auto-infer required args from ownFields", () => {
        const baseType = createSchemaType(
            "ProxyBaseFunctionType",
            "OBJECT",
            [],
            [
                {
                    name: "search",
                    category: "SCALAR",
                    argGraphQLTypeMap: { q: "String!" },
                },
            ],
        );
        const childType = createSchemaType(
            "ProxyChildFunctionType",
            "OBJECT",
            [baseType],
            ["id"],
        );
        const selection = createSelection<string, Selection<string, object, object>>(
            childType,
            enumInputMetadata,
            undefined,
        );

        const result = (selection as any).search();
        expect(result.toString()).toContain("search");
        expect(result.toString()).not.toContain("q: $q");
    });

    it("$on with same-type builder does not force __typename", () => {
        const nodeType = makeType("SameNode", ["id", "name"]);
        const parentSelection = createSelection<string, Selection<string, object, object>>(
            nodeType,
            enumInputMetadata,
            undefined,
        );

        const result = (parentSelection as any).$on((it: any) => it.id);
        expect(result.fieldMap.has("__typename")).toBe(false);
        expect(result.fieldMap.has("...")).toBe(true);
    });

    it("$on throws when typeName cannot be resolved", () => {
        const nodeType = makeType("OnUnknownTypeRoot", ["id"]);
        const selection = createSelection<string, Selection<string, object, object>>(
            nodeType,
            enumInputMetadata,
            undefined,
        );

        expect(() =>
            (selection as any).$on("NeverRegisteredType", (it: any) => it.id),
        ).toThrow('Cannot resolve schema type "NeverRegisteredType" for $on');
    });

    it("$on throws when arguments are invalid", () => {
        const nodeType = makeType("OnInvalidArgsRoot", ["id"]);
        const selection = createSelection<string, Selection<string, object, object>>(
            nodeType,
            enumInputMetadata,
            undefined,
        );

        expect(() => (selection as any).$on("OnlyTypeName")).toThrow(
            "$on requires a builder or (typeName, builder) arguments",
        );
    });

    it("$use throws when argument is not a fragment spread", () => {
        const nodeType = makeType("UseInvalidArgsRoot", ["id"]);
        const selection = createSelection<string, Selection<string, object, object>>(
            nodeType,
            enumInputMetadata,
            undefined,
        );

        expect(() => (selection as any).$use((selection as any).id)).toThrow(
            "$use requires a fragment created by fragment$",
        );
    });
});
