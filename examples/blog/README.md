# Blog Example

Demonstrates `@ptdgrp/typedgql` with a blog schema — posts, authors, comments, and tags.

## Schema

```graphql
type Post {
  id: ID!
  title: String!
  author: Author!
  comments: [Comment!]!
  tags: [Tag!]!
}
```

## Setup

```bash
# from the repo root
pnpm install

# start dev server — codegen runs automatically on startup
# and re-runs whenever schema.graphql changes
pnpm --filter @ptdgrp/typedgql-example-blog dev
```

The plugin is configured in `vite.config.ts`:

```typescript
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [typedgql({ schema: "./schema.graphql" })],
});
```

## What it shows

**Scalar field selection** — property access chains:

```typescript
import { query$, execute } from "@ptdgrp/typedgql";

const data = await execute(query$.posts((post) => post.id.title.publishedAt));
```

**Nested association fields** — callback selections:

```typescript
const data = await execute(
  query$.posts((post) =>
    post.id.title
      .author((author) => author.id.name)
      .comments((comment) => comment.id.body.author((a) => a.name))
      .tags((tag) => tag.name),
  ),
);
```

**Mutations with variables:**

```typescript
import { mutation$, execute } from "@ptdgrp/typedgql";

const data = await execute(
  mutation$.createPost((post) => post.id.title.author((a) => a.name)),
  { variables: { input: { title: "Hello", content: "...", authorId: "a1" } } },
);
```

The return type of `execute()` is fully inferred — only the fields you selected are present in the result type.

## Files

| File             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `schema.graphql` | GraphQL schema definition                 |
| `vite.config.ts` | Vite config with typedgql plugin          |
| `executor.ts`    | In-process GraphQL executor (mock server) |
| `mock-data.ts`   | In-memory data                            |
| `client.ts`      | Query and mutation examples               |
