---
title: typedgql Runtime Integration
description: Executor/subscriber contracts, transport adapters, and lifecycle.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Runtime Integration

## 1. Contracts

```ts
type GraphQLExecutor = (
  request: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

type GraphQLSubscriber = (
  request: string,
  variables: Record<string, unknown>,
) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
```

`request` is a complete GraphQL document (operation + fragments).

Each response payload should follow GraphQL shape:

```ts
{ data?: unknown; errors?: readonly unknown[] }
```

## 2. Error handling

- Transport error (network/auth/protocol): throw.
- GraphQL `errors`: runtime throws `GraphQLError`.
- `data + errors`: runtime still treats as error.

## 3. HTTP adapter (query/mutation)

```ts
setGraphQLExecutor(async (request, variables) => {
  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });
  return res.json();
});
```

## 4. AsyncIterable adapter (subscription)

```ts
setGraphQLSubscriber(async function* (request, variables) {
  // Bridge ws/sse/custom transport to AsyncIterable payloads.
  for await (const packet of transportSubscribe(request, variables)) {
    yield packet;
  }
});
```

## 5. Cancellation and cleanup

When consumer stops `for await`, ensure your transport closes stream and unsubscribes server-side resources.
