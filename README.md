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

- [Configuration Guide](./docs/configuration.md) - **NEW: Configuration file support**
- [Advanced Usage](./docs/advanced-usage.md)
- [Runtime Integration Guide](./docs/runtime-integration.md)
- [Quickstart](./docs/quickstart.md)
- [API Map](./docs/api-map.md)
- [Variables Semantics](./docs/variables.md)
- [Fragments Guide](./docs/fragments.md)
- [Runtime Integration Guide](./docs/runtime-integration.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Generated Files Guide](./docs/generated-files.md)

### 0. Configuration File (Optional)

Create a `.typedgqlrc.toml` file in your project root:

```toml
# GraphQL schema source
schema = "./schema.graphql"

# Output directory for generated files
outputDir = "./src/__generated"

# Indentation (optional)
indent = "  "

# Scalar type mapping (optional)
[scalarTypeMap]
DateTime = "string"
JSON = "JsonObject"
```

See [Configuration Guide](./docs/configuration.md) for all available options.

### 1. Vite Plugin (Recommended)

Configure `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    // With inline options
    typedgql({ schema: "./schema.graphql" }),
    // or remote schema:
    // typedgql({ schema: "http://localhost:4000/graphql" }),
    // or use .typedgqlrc.toml config file:
    // typedgql(),
  ],
});
```

Codegen runs automatically when Vite starts, and re-runs when the schema changes.

### 2. Manual Generation in Node

```ts
import { Generator, loadLocalSchema, loadConfig } from "@ptdgrp/typedgql/node";

// Option 1: Use configuration file
const config = await loadConfig();
const generator = new Generator({
  ...config,
  schemaLoader: () => loadLocalSchema(config.schema),
});

// Option 2: Programmatic configuration
const generator = new Generator({
  schemaLoader: () => loadLocalSchema("./schema.graphql"),
  targetDir: "./src/__generated",
});

await generator.generate();
```

### 3. CLI Tool

If you have a `.typedgqlrc.toml` configuration file, you can use the CLI:

```bash
# Run code generation
npx typedgql

# Or add to package.json scripts
{
  "scripts": {
    "codegen": "typedgql"
  }
}
```

The CLI will automatically read your `.typedgqlrc.toml` configuration and generate types accordingly.

### 4. Runtime Execution (Basic Example)

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
