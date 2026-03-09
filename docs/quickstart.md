---
title: typedgql Quickstart
description: 5-minute setup from schema to execute/subscribe.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Quickstart

## 1. Install

```bash
pnpm add @ptdgrp/typedgql
pnpm add -D graphql typescript
```

## 2. Generate code

### Vite plugin (recommended)

```ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [typedgql({ schema: "./schema.graphql" })],
});
```

### Node script

```ts
import { Generator, loadLocalSchema } from "@ptdgrp/typedgql/node";

await new Generator({
  schemaLoader: () => loadLocalSchema("./schema.graphql"),
}).generate();
```

## 3. Execute query/mutation

```ts
import { G, execute, setGraphQLExecutor } from "@ptdgrp/typedgql";

setGraphQLExecutor(async (request, variables) => {
  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });
  return res.json();
});

const selection = G.query((q) => q.viewer((u) => u.id.name), "ViewerQuery");
const data = await execute(selection);
```

## 4. Execute with variables

```ts
const selection = G.query((q) => q.post((p) => p.id.title));
const data = await execute(selection, { variables: { id: "p1" } });
```

Optional explicit binding:

```ts
import { ParameterRef } from "@ptdgrp/typedgql";

const s = G.query((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) => p.id.title),
);
await execute(s, { variables: { postId: "p1" } });
```

## 5. Execute subscription

```ts
import { G, subscribe, setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async function* (request, variables) {
  // Adapt your ws/sse/custom transport to AsyncIterable
  yield { data: { postUpdated: { id: "1", title: "Hello" } } };
});

const selection = G.subscription((s) =>
  s.postUpdated((p) => p.id.title),
);

for await (const payload of subscribe(selection)) {
  console.log(payload.postUpdated?.title);
}
```
