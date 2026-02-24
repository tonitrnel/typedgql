import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createSelection, createSchemaType } from "../proxy";
import { EnumInputMetadataBuilder } from "../enum-metadata";
import { FragmentSpread } from "../types";
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

    it("$on(fragmentSpread) embeds named fragment using symbol marker", () => {
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

        class ChatFragment extends FragmentSpread<"chatFields", "Chat", object, object> {
            constructor(selection: Selection<"Chat", object, object>) {
                super("chatFields", selection);
            }
        }

        const result = (parentSelection as any).$on(new ChatFragment((childSelection as any).id.role));
        expect(result.fieldMap.has("... chatFields")).toBe(true);
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
});
