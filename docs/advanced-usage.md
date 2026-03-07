---
title: typedgql Advanced Usage
description: Advanced typedgql APIs and examples, including fragments, inline fragments, subscriptions, directives, and type extraction.
last_modified: 2026-03-07T01:19:00Z
---

# typedgql Advanced Usage

This document extends the basics in `README.md` and focuses on:

- `query$ / mutation$ / subscription$` and operation naming
- how `fragment$`, `$on`, and `$use` work together
- subscription execution flow
- directives and built-in selection methods

## 1. Root operations and naming

You can use root selection builders directly:

```ts
import { query$, mutation$, subscription$ } from "@ptdgrp/typedgql";

const q1 = query$((q) => q.posts((p) => p.id.title));
const q2 = query$((q) => q.posts((p) => p.id.title), "PostsQuery");
```

Or use the aggregated `G` entry (equivalent):

```ts
import { G } from "@ptdgrp/typedgql";

const q = G.query((x) => x.posts((p) => p.id.title), "PostsQuery");
```

## 2. fragment / inline fragment

### 2.1 `fragment$` (named fragment)

```ts
import { fragment$, query$ } from "@ptdgrp/typedgql";

const userBase = fragment$("User", (u) => u.id.name, "UserBase");

const selection = query$((q) => q.viewer((u) => u.$use(userBase)));
```

GraphQL equivalent:

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

### 2.2 `$on` (inline fragment)

`$on` is for inline fragments and does not emit a standalone `fragment Xxx on ...` definition.

```ts
const selection = query$(
  (q) =>
    q.search((node) =>
      node
        .$on("User", (u) => u.id.name)
        .$on("Page", (p) => p.id.handle),
    ),
  "InlineFragmentTyping",
);
```

GraphQL equivalent:

```graphql
query InlineFragmentTyping {
  search {
    ... on User {
      id
      name
    }
    ... on Page {
      id
      handle
    }
  }
}
```

## 3. Subscription usage

Prerequisite: your schema includes a `Subscription` root type.

### 3.1 Register a subscriber

```ts
import { setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async (request, variables) => {
  // Plug in graphql-ws / SSE / your own realtime channel
  // Must return AsyncIterable<GraphQLResponse>
  return myGraphQLSubscribe(request, variables);
});
```

### 3.2 Consume the stream

```ts
import { subscription$, subscribe } from "@ptdgrp/typedgql";

const selection = subscription$(
  (s) => s.postCreated((post) => post.id.title.author((a) => a.id.name)),
  "PostCreatedSub",
);

for await (const payload of subscribe(selection)) {
  console.log(payload.postCreated?.title);
}
```

GraphQL equivalent:

```graphql
subscription PostCreatedSub {
  postCreated {
    id
    title
    author {
      id
      name
    }
  }
}
```

## 4. Directives and built-ins

Common built-in methods:

- `$include(condition)`
- `$skip(condition)`
- `$directive(name, args?)`
- `$alias(alias)`
- `$omit(...fields)`
- `$on(builder)` / `$on(typeName, builder)`
- `$use(fragment)` (supports `ValueOrThunk`, i.e. value or `() => value`)

Note: `$include/$skip/$directive` are field-level when there is a last field; otherwise they apply to the selection.

### 4.1 Field-level `$include` / `$skip`

```ts
const selection = query$((q) =>
  q.post({ id: "p1" }, (p) => p.id.title.$include(true).content.$skip(false)),
);
```

GraphQL equivalent:

```graphql
query {
  post(id: "p1") {
    id
    title @include(if: true)
    content @skip(if: false)
  }
}
```

### 4.2 Selection-level `$directive`

```ts
const selection = query$((q) =>
  q.$directive("cacheControl", { maxAge: 60 }).posts((p) => p.id.title),
);
```

### 4.3 `$alias` / `$omit`

```ts
const selection = query$((q) =>
  q.post({ id: "p1" }, (p) => p.id.title.$alias("postTitle").content.$omit("content")),
);
```

## 5. Parameters and variables

Recommended: keep selection reusable and pass variable values at execution time.

```ts
import { query$, execute, ParameterRef } from "@ptdgrp/typedgql";

const selection = query$((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) => p.id.title),
);

await execute(selection, { variables: { postId: "p2" } });
```

## 6. Extract fragment types

`fragment$` returns a `FragmentRef`. To extract shape/variables, read from its `selection`:

```ts
import { fragment$, ShapeOf, VariablesOf } from "@ptdgrp/typedgql";

const userBase = fragment$("User", (u) => u.id.name, "UserBase");

type UserBaseShape = ShapeOf<typeof userBase.selection>;
type UserBaseVariables = VariablesOf<typeof userBase.selection>;
```
