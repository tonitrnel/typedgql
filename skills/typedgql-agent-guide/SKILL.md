---
name: typedgql-agent-guide
description: Helps agents write, explain, and debug application code that uses @ptdgrp/typedgql builders, variables, fragments, runtime executors/subscribers, and typed hook wrappers. Use when implementing or reviewing typedgql queries, mutations, subscriptions, fragments, generated selection types, useTypedQuery/useTypedMutation-style wrappers, or typedgql runtime/codegen errors.
---

# Typedgql Agent Guide

This skill teaches agents how to write project-native `@ptdgrp/typedgql` usage. It is not an install, publish, or package-maintenance guide.

## Quick Start

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

## Workflow

1. Classify the task.

- For query, mutation, subscription, variables, fragments, or runtime wiring, use [references/usage.md](references/usage.md).
- For errors, stale generated output, or surprising runtime behavior, use [references/troubleshooting.md](references/troubleshooting.md).
- For application-specific hook wrappers, inspect the consuming project's local GraphQL helper files and nearby examples.

2. Prefer project conventions.

- Use `G.query`, `G.mutation`, and `G.subscription` unless lower-level builders are already the local pattern.
- Keep selections reusable. Pass request-time variables to `execute(...)`, `subscribe(...)`, or the host hook's `execute(...)`.
- Use `fragment$` or `G.fragment(...)` with `$use(...)` for repeated field sets. Use `$on(typeName, builder)` for inline polymorphic branches.
- Keep selections minimal; choose fields the caller actually consumes.

3. Respect host wrappers.

- If the app wraps typedgql with helpers such as `useTypedQuery` or `useTypedMutation`, define business hooks through those helpers instead of calling the low-level executor from components.
- In component code, prefer existing hook state and methods such as `data`, `pending`, `error`, `execute`, and `refresh`.
- Derive result types from selections or fragments with `ShapeOf` when available. Derive query or mutation input types from the host helper utilities when the project provides them.
- For query hooks, prefer automatic execution with reactive or option-based variables when the wrapper supports it. Use `enabled: false` plus manual `execute(...)` only when a real prerequisite must be satisfied.
- For mutation hooks, assume manual execution from a user or workflow action unless local code shows another convention.

4. Avoid common wrong turns.

- Do not hand-write GraphQL document strings when typedgql builders can express the operation.
- Do not treat `execute(...)` or `subscribe(...)` as transport setup. Wire transport with `setGraphQLExecutor` or `setGraphQLSubscriber`, or use the app's wrapper.
- Do not hard-code request-time business variables into reusable selections unless the schema argument is intentionally a literal.
- Do not use named fragments as a substitute for local type narrowing.

5. Troubleshoot by symptom.

- Match the exact error or behavior to [references/troubleshooting.md](references/troubleshooting.md).
- State the likely cause.
- Give the minimal fix and a short corrected example.
- If generated output appears stale, distinguish generation failure from stale dev-server or dependency-cache consumption.

## Answering Rules

- Keep examples short and compatible with `@ptdgrp/typedgql`.
- When host code has wrappers, mirror local naming, state shape, and options instead of inventing a new abstraction.
- Mention bundled reference files only when useful; do not assume the consuming project has the typedgql source repository layout.
- If the request drifts into installation, publishing, or plugin authoring, say that this skill does not cover that area unless the user explicitly asks for it.

## References

- Read `references/usage.md` for the normal usage path and API selection guidance.
- Read `references/troubleshooting.md` for common failures, diagnosis steps, and fix patterns.
