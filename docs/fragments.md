---
title: typedgql Fragments
description: fragment$, $use, and $on usage with GraphQL equivalents.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Fragments

## 1. Named fragment: `fragment$`

```ts
import { fragment$, G } from "@ptdgrp/typedgql";

const userBase = fragment$("User", (u) => u.id.name, "UserBase");
const q = G.query((x) => x.viewer((u) => u.$use(userBase)));
```

GraphQL:

```graphql
query {
  viewer {
    ...UserBase
  }
}
fragment UserBase on User {
  id
  name
}
```

## 2. Inline fragment: `$on`

```ts
const q = G.query((q) =>
  q.node({ id: "1" }, (n) =>
    n
      .$on("User", (u) => u.id.name)
      .$on("Page", (p) => p.id.handle),
  ),
);
```

## 3. `$use` vs `$on`

- `$use`: reusable named fragment.
- `$on`: local inline fragment branch.

Use `$use` for cross-query reuse. Use `$on` for polymorphic branch selection in one place.
