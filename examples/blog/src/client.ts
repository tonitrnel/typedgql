/**
 * Blog example — demonstrates the typedgql fluent chain API.
 *
 * Run after codegen:
 *   pnpm codegen
 *   pnpm dev
 *
 * All generated types and helpers are imported from '@ptdgrp/typedgql'.
 * The __generated directory is an implementation detail — users never touch it.
 */

import {
  G,
  execute,
  setGraphQLExecutor,
} from "@ptdgrp/typedgql";
import { executeGraphQL } from "./executor";

// Wire up the executor (in a real app this would be a fetch() call to your API)
setGraphQLExecutor(async (request, variables) => {
  return executeGraphQL(request, variables);
});

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetch a list of posts with nested author, comments, and tags.
 * Scalar fields are selected via property access; association fields
 * use a callback to select sub-fields.
 */
async function fetchPosts() {
  console.log("\n── fetchPosts ──────────────────────────────────────────");

  const data = await execute(
    G.query().posts((post) =>
      post.id.title.publishedAt
        .author((author) => author.id.name)
        .comments((comment) =>
          comment.id.body.createdAt.author((a) => a.id.name),
        )
        .tags((tag) => tag.id.name),
    ),
  );

  for (const post of data.posts) {
    console.log(
      `\n[${post.id}] ${post.title} (${post.publishedAt ?? "draft"})`,
    );
    console.log(`  Author: ${post.author.name}`);
    console.log(`  Tags:   ${post.tags.map((t) => t.name).join(", ")}`);
    console.log(`  Comments (${post.comments.length}):`);
    for (const c of post.comments) {
      console.log(`    • ${c.author.name}: "${c.body}" — ${c.createdAt}`);
    }
  }
}

/**
 * Fetch a single post by ID.
 */
async function fetchPost(id: string) {
  console.log("\n── fetchPost ───────────────────────────────────────────");

  const data = await execute(
    G.query().post((post) =>
      post.id.title.content
        .author((author) => author.id.name.bio)
        .tags((tag) => tag.name),
    ),
    { variables: { id } },
  );

  if (!data.post) {
    console.log(`Post ${id} not found`);
    return;
  }

  const { post } = data;
  console.log(`\n${post.title}`);
  console.log(
    `By: ${post.author.name}${post.author.bio ? ` — ${post.author.bio}` : ""}`,
  );
  console.log(`Tags: ${post.tags.map((t) => t.name).join(", ")}`);
  console.log(`\n${post.content}`);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a new post.
 */
async function createPost() {
  console.log("\n── createPost ──────────────────────────────────────────");

  const data = await execute(
    G.mutation().createPost((post) =>
      post.id.title.publishedAt.author((a) => a.name),
    ),
    {
      variables: {
        input: {
          title: "Introduction to typedgql",
          content: "typedgql provides end-to-end type safety for GraphQL...",
          authorId: "a1",
          tagIds: ["t1", "t2"],
        },
      },
    },
  );

  console.log(`\nCreated: [${data.createPost.id}] "${data.createPost.title}"`);
  console.log(`Author: ${data.createPost.author.name}`);
  console.log(`Published: ${data.createPost.publishedAt ?? "draft"}`);
}

/**
 * Add a comment to a post.
 */
async function addComment(postId: string) {
  console.log("\n── addComment ──────────────────────────────────────────");

  const data = await execute(
    G.mutation().addComment((comment) =>
      comment.id.body.createdAt.author((a) => a.id.name),
    ),
    {
      variables: {
        input: {
          postId,
          body: "This is exactly what I was looking for!",
          authorId: "a2",
        },
      },
    },
  );

  const { addComment: c } = data;
  console.log(`\nComment [${c.id}] by ${c.author.name}: "${c.body}"`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

await fetchPosts();
await fetchPost("p2");
await createPost();
await addComment("p1");
