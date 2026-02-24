/**
 * Integration test: validates the codegen output (file structure + content)
 * against a real-world blog schema with types, inputs, and mutations.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLString,
    GraphQLInt,
    GraphQLID,
    GraphQLSchema,
} from "graphql";
import { Generator } from "../generator";
import { readdir, readFile, rm, access } from "fs/promises";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// ─── Build a blog-like schema ────────────────────────────────────────

const Tag = new GraphQLObjectType({
    name: "Tag",
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLID) },
        name: { type: new GraphQLNonNull(GraphQLString) },
    }),
});

const Comment = new GraphQLObjectType({
    name: "Comment",
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLID) },
        body: { type: new GraphQLNonNull(GraphQLString) },
        createdAt: { type: new GraphQLNonNull(GraphQLString) },
        author: { type: new GraphQLNonNull(Author) },
    }),
});

const Author: GraphQLObjectType = new GraphQLObjectType({
    name: "Author",
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLID) },
        name: { type: new GraphQLNonNull(GraphQLString) },
        bio: { type: GraphQLString },
        posts: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Post))) },
    }),
});

const Post: GraphQLObjectType = new GraphQLObjectType({
    name: "Post",
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLID) },
        title: { type: new GraphQLNonNull(GraphQLString) },
        content: { type: new GraphQLNonNull(GraphQLString) },
        publishedAt: { type: GraphQLString },
        author: { type: new GraphQLNonNull(Author) },
        comments: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Comment))) },
        tags: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Tag))) },
    }),
});

const CreatePostInput = new GraphQLInputObjectType({
    name: "CreatePostInput",
    fields: {
        title: { type: new GraphQLNonNull(GraphQLString) },
        content: { type: new GraphQLNonNull(GraphQLString) },
        authorId: { type: new GraphQLNonNull(GraphQLID) },
        tagIds: { type: new GraphQLList(new GraphQLNonNull(GraphQLID)) },
    },
});

const AddCommentInput = new GraphQLInputObjectType({
    name: "AddCommentInput",
    fields: {
        postId: { type: new GraphQLNonNull(GraphQLID) },
        body: { type: new GraphQLNonNull(GraphQLString) },
        authorId: { type: new GraphQLNonNull(GraphQLID) },
    },
});

const Query = new GraphQLObjectType({
    name: "Query",
    fields: {
        posts: {
            type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Post))),
            args: {
                limit: { type: GraphQLInt },
                offset: { type: GraphQLInt },
            },
        },
        post: {
            type: Post,
            args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        },
        author: {
            type: Author,
            args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        },
    },
});

const Mutation = new GraphQLObjectType({
    name: "Mutation",
    fields: {
        createPost: {
            type: new GraphQLNonNull(Post),
            args: { input: { type: new GraphQLNonNull(CreatePostInput) } },
        },
        addComment: {
            type: new GraphQLNonNull(Comment),
            args: { input: { type: new GraphQLNonNull(AddCommentInput) } },
        },
    },
});

const schema = new GraphQLSchema({
    query: Query,
    mutation: Mutation,
    types: [Post, Author, Comment, Tag, CreatePostInput, AddCommentInput],
});

// ─── Test suite ──────────────────────────────────────────────────────

describe("Codegen output (blog schema)", () => {
    let targetDir: string;
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "typedgql-codegen-"));
        targetDir = join(tmpDir, "__generated");
        const generator = new Generator({
            schemaLoader: async () => schema,
            targetDir,
        });
        await generator.generate();
    });

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    // ── Directory structure ──

    it("creates all expected top-level files", async () => {
        const files = await readdir(targetDir);
        expect(files).toContain("index.ts");
        expect(files).toContain("client-runtime.ts");
        expect(files).toContain("type-hierarchy.ts");
        expect(files).toContain("enum-input-metadata.ts");
        expect(files).toContain("selections");
        expect(files).toContain("inputs");
    });

    it("creates a selection file per type (kebab-case)", async () => {
        const files = await readdir(join(targetDir, "selections"));
        expect(files).toContain("index.ts");
        expect(files).toContain("query-selection.ts");
        expect(files).toContain("mutation-selection.ts");
        expect(files).toContain("post-selection.ts");
        expect(files).toContain("author-selection.ts");
        expect(files).toContain("comment-selection.ts");
        expect(files).toContain("tag-selection.ts");
        expect(files).toHaveLength(7); // 6 types + index
    });

    it("creates an input file per input type (kebab-case)", async () => {
        const files = await readdir(join(targetDir, "inputs"));
        expect(files).toContain("index.ts");
        expect(files).toContain("create-post-input.ts");
        expect(files).toContain("add-comment-input.ts");
        expect(files).toHaveLength(3); // 2 inputs + index
    });

    // ── Index file ──

    it("index.ts re-exports client runtime and type hierarchy helpers", async () => {
        const content = await readFile(join(targetDir, "index.ts"), "utf-8");
        expect(content).toContain('from "./client-runtime"');
        expect(content).toContain("GraphQLExecutor");
        expect(content).toContain("GraphQLSubscriber");
        expect(content).toContain("setGraphQLExecutor");
        expect(content).toContain("setGraphQLSubscriber");
        expect(content).toContain("execute");
        expect(content).toContain("subscribe");
        expect(content).toContain('from \'./type-hierarchy\'');
        expect(content).toContain("ImplementationType");
        expect(content).toContain("upcastTypes");
        expect(content).toContain("downcastTypes");
    });

    // ── Selections index ──

    it("selections/index.ts exports selection types and only root instances", async () => {
        const content = await readFile(
            join(targetDir, "selections", "index.ts"),
            "utf-8",
        );
        // Type exports
        expect(content).toContain("export type {QuerySelection");
        expect(content).toContain("export type {MutationSelection");
        expect(content).toContain("export type {PostSelection}");
        expect(content).toContain("export type {AuthorSelection}");
        expect(content).toContain("export type {CommentSelection}");
        expect(content).toContain("export type {TagSelection}");

        // Only root operation instances are exported as values
        expect(content).toContain("export {query$}");
        expect(content).toContain("export {mutation$}");
        expect(content).not.toContain("post$");
        expect(content).not.toContain("author$");
        expect(content).not.toContain("comment$");
        expect(content).not.toContain("tag$");

        // Query/Mutation have args
        expect(content).toContain("QueryArgs");
        expect(content).toContain("MutationArgs");
    });

    // ── Inputs index ──

    it("inputs/index.ts exports all input types", async () => {
        const content = await readFile(
            join(targetDir, "inputs", "index.ts"),
            "utf-8",
        );
        expect(content).toContain("CreatePostInput");
        expect(content).toContain("AddCommentInput");
        // Input exports use `export type`
        expect(content).toContain("export type");
    });

    // ── Selection content ──

    it("tag-selection.ts defines TagSelection interface without precreated instances", async () => {
        const content = await readFile(
            join(targetDir, "selections", "tag-selection.ts"),
            "utf-8",
        );
        // Interface declaration
        expect(content).toContain("export interface TagSelection<");
        expect(content).toContain("ObjectSelection<'Tag'");

        // Field accessors
        expect(content).toContain('readonly id: TagSelection<');
        expect(content).toContain('readonly name: TagSelection<');

        // $omit built-in method
        expect(content).toContain('$omit');

        // Non-root types no longer emit precreated instances
        expect(content).not.toContain("export const tag$");
        expect(content).not.toContain("export const tag$$");
    });

    it("query-selection.ts has parameterized fields (args)", async () => {
        const content = await readFile(
            join(targetDir, "selections", "query-selection.ts"),
            "utf-8",
        );
        expect(content).toContain("export interface QuerySelection<");
        expect(content).toContain("QueryArgs");

        // posts field takes limit/offset args
        expect(content).toContain("posts");
        // query$ instance but no query$$ (Query has no scalar fields for default)
        expect(content).toContain("export const query$: QuerySelection<{}, {}>");
    });

    it("post-selection.ts contains nested type references", async () => {
        const content = await readFile(
            join(targetDir, "selections", "post-selection.ts"),
            "utf-8",
        );
        // Should reference child selection types
        expect(content).toContain("AuthorSelection<{}, {}>");
        expect(content).toContain("CommentSelection<{}, {}>");
        expect(content).toContain("TagSelection<{}, {}>");

        // Should have scalar fields
        expect(content).toContain('"title"');
        expect(content).toContain('"content"');
        expect(content).toContain('"publishedAt"');
    });

    // ── Input content ──

    it("create-post-input.ts declares all input fields with correct types", async () => {
        const content = await readFile(
            join(targetDir, "inputs", "create-post-input.ts"),
            "utf-8",
        );
        expect(content).toContain("CreatePostInput");
        expect(content).toContain("readonly title: string");
        expect(content).toContain("readonly content: string");
        expect(content).toContain("readonly authorId: string");
        // tagIds is nullable list
        expect(content).toContain("tagIds");
    });

    // ── client-runtime.ts ──

    it("client-runtime.ts contains runtime executor code", async () => {
        const content = await readFile(join(targetDir, "client-runtime.ts"), "utf-8");
        expect(content).toContain("GraphQLExecutor");
        expect(content).toContain("GraphQLSubscriber");
        expect(content).toContain("setGraphQLExecutor");
        expect(content).toContain("setGraphQLSubscriber");
        expect(content).toContain("export async function execute");
        expect(content).toContain("export async function* subscribe");
        expect(content).toContain("TextBuilder");
    });

    // ── type-hierarchy.ts ──

    it("type-hierarchy.ts defines ImplementationType and cast functions", async () => {
        const content = await readFile(
            join(targetDir, "type-hierarchy.ts"),
            "utf-8",
        );
        expect(content).toContain("export type ImplementationType<T>");
        expect(content).toContain("export function upcastTypes(");
        expect(content).toContain("export function downcastTypes(");
        expect(content).toContain("WithTypeName");
    });

    // ── enum-input-metadata.ts ──

    it("enum-input-metadata.ts exports ENUM_INPUT_METADATA", async () => {
        const content = await readFile(
            join(targetDir, "enum-input-metadata.ts"),
            "utf-8",
        );
        expect(content).toContain("EnumInputMetadataBuilder");
        expect(content).toContain("ENUM_INPUT_METADATA");
        expect(content).toContain("builder.build()");
    });

    // ── No enum directory (schema has no enums) ──

    it("does not create enums/ dir when schema has no enums", async () => {
        await expect(
            access(join(targetDir, "enums")),
        ).rejects.toThrow();
    });
});

describe("Codegen output (subscription root)", () => {
    it("generates subscription selection and root instance exports", async () => {
        const Subscription = new GraphQLObjectType({
            name: "Subscription",
            fields: {
                postCreated: {
                    type: new GraphQLNonNull(Post),
                },
            },
        });

        const schemaWithSubscription = new GraphQLSchema({
            query: Query,
            mutation: Mutation,
            subscription: Subscription,
            types: [Post, Author, Comment, Tag, CreatePostInput, AddCommentInput],
        });

        const tmpDir = await mkdtemp(join(tmpdir(), "typedgql-codegen-sub-"));
        const targetDir = join(tmpDir, "__generated");
        try {
            const generator = new Generator({
                schemaLoader: async () => schemaWithSubscription,
                targetDir,
            });
            await generator.generate();

            const selectionFiles = await readdir(join(targetDir, "selections"));
            expect(selectionFiles).toContain("subscription-selection.ts");

            const selectionsIndex = await readFile(
                join(targetDir, "selections", "index.ts"),
                "utf-8",
            );
            expect(selectionsIndex).toContain("export type {SubscriptionSelection");
            expect(selectionsIndex).toContain("export {subscription$}");
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });
});

describe("Codegen output (oneOf input)", () => {
    it("renders oneOf input as exclusive union", async () => {
        const NodeBy = new GraphQLInputObjectType({
            name: "NodeBy",
            isOneOf: true,
            fields: {
                id: { type: GraphQLID },
                slug: { type: GraphQLString },
            },
        });

        const QueryWithOneOf = new GraphQLObjectType({
            name: "Query",
            fields: {
                node: {
                    type: GraphQLString,
                    args: {
                        by: { type: new GraphQLNonNull(NodeBy) },
                    },
                },
            },
        });

        const schemaWithOneOf = new GraphQLSchema({
            query: QueryWithOneOf,
            types: [NodeBy],
        });

        const tmpDir = await mkdtemp(join(tmpdir(), "typedgql-codegen-oneof-"));
        const targetDir = join(tmpDir, "__generated");
        try {
            const generator = new Generator({
                schemaLoader: async () => schemaWithOneOf,
                targetDir,
            });
            await generator.generate();

            const content = await readFile(
                join(targetDir, "inputs", "node-by.ts"),
                "utf-8",
            );
            expect(content).toContain("export type NodeBy =");
            expect(content).toContain("id: Exclude<string, undefined>");
            expect(content).toContain("slug?: never");
            expect(content).toContain("slug: Exclude<string, undefined>");
            expect(content).toContain("id?: never");
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });
});
