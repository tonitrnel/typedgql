# @ptdgrp/typedgql

[![Release](https://github.com/tonitrnel/typedgql/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/tonitrnel/typedgql/actions/workflows/publish-npm.yml)

`typedgql` is a TypeScript-first GraphQL client codegen + runtime library focused on end-to-end type safety and a fluent query-building experience.

For Chinese documentation, see [README.zh-CN.md](./README.zh-CN.md).

## Features

- Generate strongly typed client code from a GraphQL schema
- Fluent DSL for queries and mutations, for example:
  `G.query((q) => q.posts((p) => p.id.title))`
- Decouple selection building from variable values:
  build once, pass `variables` at `execute(...)` time
- Zero third-party runtime dependency
  (only depends on your GraphQL executor)
- Supports ESM/CJS
- Default output directory:
  `node_modules/@ptdgrp/typedgql/__generated`

## Installation

```bash
pnpm add @ptdgrp/typedgql
pnpm add -D graphql typescript
```

## Usage

For advanced usage (Subscription, directives, GraphQL mapping), see:

- [Advanced Usage (Chinese)](./docs/advanced-usage.zh-CN.md)

### 1. Vite Plugin (Recommended)

Configure `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    typedgql({ schema: "./schema.graphql" }),
    // or remote schema:
    // typedgql({ schema: "http://localhost:4000/graphql" }),
  ],
});
```

Codegen runs automatically when Vite starts, and re-runs when the schema changes.

### 2. Manual Generation in Node

```ts
import { Generator, loadLocalSchema } from "@ptdgrp/typedgql/node";

const generator = new Generator({
  schemaLoader: () => loadLocalSchema("./schema.graphql"),
});

await generator.generate();
```

### 3. Runtime Execution (Basic Example)

```ts
import { G, execute, setGraphQLExecutor } from "@ptdgrp/typedgql";

setGraphQLExecutor(async (request, variables) => {
  const res = await fetch("http://localhost:8080/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });
  return res.json();
});

const selection = G.query((q) =>
  q.posts((post) => post.id.title.author((author) => author.id.name)),
);

const data = await execute(selection);
```

### 4. Query With Variables (Recommended)

Selections are reusable. Pass variables when calling `execute(...)`.

```ts
import { G, execute } from "@ptdgrp/typedgql";

const selection = G.query((q) => q.post((post) => post.id.title.content));

const data = await execute(selection, {
  variables: { id: "p2" },
});
```

### 5. Explicit Variable Placeholder (Optional)

```ts
import { G, execute, ParameterRef } from "@ptdgrp/typedgql";

const selection = G.query((q) =>
  q.post({ id: ParameterRef.of("postId") }, (post) => post.id.title),
);

const data = await execute(selection, {
  variables: { postId: "p2" },
});
```

## License

MIT. See [LICENSE](./LICENSE).

## Credits

This project evolves from ideas in [graphql-ts-client](https://github.com/babyfish-ct/graphql-ts-client). Thanks to [ChenTao](https://github.com/babyfish-ct) for the foundational work.
