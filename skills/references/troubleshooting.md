# Typedgql Troubleshooting Guide

Use this reference when the user reports a typedgql error, stale generated output, or behavior that does not match expectations.

Start from the exact symptom. Quote the message when possible.

## Fast triage

1. Determine whether the issue is selection building, variables, runtime transport, or generated output freshness.
2. Match the symptom to the sections below.
3. If no section matches, inspect the consuming project's typedgql wrapper files, transport setup, generated typings, and nearby examples.
4. If the user is working inside the typedgql source repository, inspect the relevant runtime/codegen source and tests only after checking the public behavior first.

## `Field "xxx" requires a child selection`

Cause:

- An object or association field was selected without a nested builder.

Fix:

```ts
q.user((u) => u.id.name);
```

What to tell the user:

- Scalar fields can terminate the chain.
- Object-like fields need a callback that chooses subfields.

## `Variable '$x' has conflicting GraphQL types ...`

Cause:

- The same variable name was reused in multiple argument positions with incompatible GraphQL types.

Fix:

```ts
q.a({ value: ParameterRef.of("valueForA") }, (x) => x.id);
q.b({ value: ParameterRef.of("valueForB") }, (x) => x.id);
```

What to check:

- Whether auto-propagated same-name variables are colliding with explicit bindings.
- Whether two fields expose similarly named args with different schema types.

## `Cannot infer the type of directive argument 'x'; an explicit type annotation is required.`

Cause:

- A directive argument uses `ParameterRef` in a position where typedgql cannot infer the GraphQL type.

Fix:

```ts
$directive("include", { if: ParameterRef.of("cond", "Boolean!") });
```

Rule:

- Add the GraphQL type string explicitly for directive or nested cases with ambiguous typing.

## Generated code not refreshed in dev

Typical cause:

- Generated files live under `node_modules/@ptdgrp/typedgql/__generated`, and the dev server still uses stale optimized dependencies.

Fix:

- If schema changes were handled by the typedgql Vite plugin, expect the dev server to restart automatically.
- If generation happened manually outside the plugin flow, restart the dev server or force dependency re-optimization.

What to distinguish:

- Regeneration failure: new files were not produced.
- Consumption failure: files changed, but the running dev process still serves cached output.

## Runtime transport looks wrong

Symptoms:

- `execute(...)` or `subscribe(...)` fails even though the selection shape looks valid.
- Data never arrives or the stream never closes correctly.

Check:

- `setGraphQLExecutor` returns a parsed GraphQL payload object.
- `setGraphQLSubscriber` returns an `AsyncIterable` or `Promise<AsyncIterable>`.
- Transport-level failures throw instead of returning a fake GraphQL payload.
- Subscription cleanup happens when the consumer stops iterating.

Reference:

- See `references/usage.md` for the executor/subscriber contract.

## Variable behavior looks surprising

Symptoms:

- A field receives variables the user did not pass explicitly.
- Two args unexpectedly share one variable.

Check:

- typedgql auto-propagates declared field args to same-name variables when args are omitted.
- Explicit args override only the provided keys; unspecified keys may still auto-propagate.
- Same variable name reuse is valid only when the GraphQL types are identical.

Reference:

- See `references/usage.md` for variable guidance.

## Fragment or polymorphic selection is wrong

Symptoms:

- The user expected fragment reuse but wrote inline branching.
- The user expected type narrowing but reused a named fragment.

Check:

- Use `$use(fragment)` for reusable named fragments.
- Use `$on(typeName, builder)` for local interface/union branches.
- Use `$on(builder)` only when remaining on the current type context.

Reference:

- See `references/usage.md` for fragment guidance.
