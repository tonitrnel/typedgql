/**
 * A simple in-process GraphQL executor using graphql-js.
 * Works in both browser and Node.js environments.
 * In a real app this would be a fetch() call to your API.
 */

import { buildSchema, graphql, GraphQLSchema } from "graphql";
import schemaSDL from "./schema.graphql?raw";
import {
  tags,
  authors,
  posts,
  comments,
  type PostRecord,
  type AuthorRecord,
  type CommentRecord,
  type TagRecord,
} from "./mock-data";

const schema: GraphQLSchema = buildSchema(schemaSDL);

// Resolvers
const rootValue = {
  posts({ limit = 10, offset = 0 }: { limit?: number; offset?: number }) {
    return posts.slice(offset, offset + limit).map(resolvePost);
  },

  post({ id }: { id: string }) {
    const p = posts.find((p) => p.id === id);
    return p ? resolvePost(p) : null;
  },

  author({ id }: { id: string }) {
    const a = authors.find((a) => a.id === id);
    return a ? resolveAuthor(a) : null;
  },

  createPost({
    input,
  }: {
    input: {
      title: string;
      content: string;
      authorId: string;
      tagIds?: string[];
    };
  }) {
    const newPost: PostRecord = {
      id: `p${posts.length + 1}`,
      title: input.title,
      content: input.content,
      publishedAt: null,
      authorId: input.authorId,
      tagIds: input.tagIds ?? [],
    };
    posts.push(newPost);
    return resolvePost(newPost);
  },

  addComment({
    input,
  }: {
    input: { postId: string; body: string; authorId: string };
  }) {
    const newComment: CommentRecord = {
      id: `c${comments.length + 1}`,
      body: input.body,
      createdAt: new Date().toISOString().split("T")[0]!,
      authorId: input.authorId,
      postId: input.postId,
    };
    comments.push(newComment);
    return resolveComment(newComment);
  },
};

function resolvePost(p: PostRecord) {
  return {
    ...p,
    author: () => resolveAuthor(authors.find((a) => a.id === p.authorId)!),
    comments: () =>
      comments.filter((c) => c.postId === p.id).map(resolveComment),
    tags: () => tags.filter((t) => p.tagIds.includes(t.id)).map(resolveTag),
  };
}

function resolveAuthor(a: AuthorRecord) {
  return {
    ...a,
    posts: () => posts.filter((p) => p.authorId === a.id).map(resolvePost),
  };
}

function resolveComment(c: CommentRecord) {
  return {
    ...c,
    author: () => resolveAuthor(authors.find((a) => a.id === c.authorId)!),
  };
}

function resolveTag(t: TagRecord) {
  return { ...t };
}

/** Execute a GraphQL request against the in-memory schema */
export async function executeGraphQL(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<any> {
  const result = await graphql({
    schema,
    source: query,
    rootValue,
    variableValues: variables,
  });
  if (result.errors) {
    throw new Error(result.errors.map((e) => e.message).join("\n"));
  }
  return result;
}
