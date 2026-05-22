# Typedgql Usage Guide

Use this reference when the user needs to write or explain application code that uses `@ptdgrp/typedgql`.

Do not use this file for installation or plugin-internal work.

## Pick the right path

- For a quick end-to-end example, use "Core usage flow" below.
- For advanced selection building, use "Selection-building guidance".
- For executor/subscriber wiring, use "Runtime integration guidance".
- For variable propagation and `ParameterRef`, use "Variables guidance".
- For fragment reuse and inline fragments, use "Fragments guidance".
- For host-application hook wrappers, inspect the consuming project's local wrapper and nearby usage examples.
- For stale output or common runtime/codegen errors, use `references/troubleshooting.md`.

## Core usage flow

1. Build a selection with `G.query`, `G.mutation`, or `G.subscription`.
2. Register a transport with `setGraphQLExecutor` or `setGraphQLSubscriber`.
3. Execute with `execute(selection, { variables })` or consume `subscribe(selection, { variables })`.
4. Keep the selection reusable; pass concrete variable values at execution time.

## Preferred examples

### Query

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

### Query with variables

```ts
import { G, execute } from "@ptdgrp/typedgql";

const selection = G.query((q) => q.post((p) => p.id.title));
const data = await execute(selection, { variables: { id: "p1" } });
```

### Explicit variable binding

Use explicit binding when the variable name must differ from the schema arg name or when conflict avoidance matters.

```ts
import { G, execute, ParameterRef } from "@ptdgrp/typedgql";

const selection = G.query((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) => p.id.title),
);

await execute(selection, { variables: { postId: "p1" } });
```

### Subscription

```ts
import { G, subscribe, setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async function* (request, variables) {
  yield { data: { postUpdated: { id: "1", title: "Hello" } } };
});

const selection = G.subscription((s) => s.postUpdated((p) => p.id.title));

for await (const payload of subscribe(selection)) {
  console.log(payload.postUpdated?.title);
}
```

## Selection-building guidance

- Use `G.query / G.mutation / G.subscription` for most examples.
- Use `query$ / mutation$ / subscription$` only when a lower-level root builder is specifically relevant.
- Name the operation when a stable document name helps debugging or generated output review.
- Treat object fields as requiring a child builder.
- Use built-ins like `$alias`, `$directive`, `$include`, `$skip`, and `$omit` only where they clarify the example.

## Variables guidance

- Prefer implicit same-name variable propagation when it keeps the query simple.
- Pass explicit args only for overrides.
- Use `ParameterRef.of(name)` for field args.
- Use `ParameterRef.of(name, typeRef)` for directive or nested locations where GraphQL type inference may be ambiguous.
- Reuse variable names only when the GraphQL types are identical.

## Fragments guidance

- Use `fragment$(typeName, builder, fragmentName?)` plus `$use(fragment)` for reusable selections.
- Use `$on(typeName, builder)` for interface/union narrowing in one place.
- Use `$on(builder)` only when extending the current selection context without switching types.

## Runtime integration guidance

- `setGraphQLExecutor` must return a GraphQL payload object, typically from `res.json()`.
- `setGraphQLSubscriber` must return or resolve to an `AsyncIterable`.
- Throw transport-level failures such as network/auth/protocol problems.
- Expect runtime errors when the GraphQL payload contains `errors`, even if `data` is also present.
- Ensure subscriptions clean up transport resources when iteration stops.

## When docs are not enough

Inspect local project code only after checking the guidance above.

- Read the consuming project's typedgql wrapper files, GraphQL transport setup, and nearby query/mutation examples.
- If the user is working inside the typedgql source repository, inspect the relevant runtime/codegen source and tests only for behavior that is ambiguous or undocumented.
