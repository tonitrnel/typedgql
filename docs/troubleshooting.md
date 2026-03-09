---
title: typedgql Troubleshooting
description: Common runtime/codegen errors and fixes.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Troubleshooting

## `Field "xxx" requires a child selection`

Cause: object/association field was selected without child builder.

Fix:

```ts
q.user((u) => u.id.name);
```

## `Variable '$x' has conflicting GraphQL types ...`

Cause: same variable name used in multiple arg slots with different types.

Fix: rename one side with `ParameterRef.of("anotherName")`.

## `Cannot infer the type of directive argument 'x'; an explicit type annotation is required.`

Cause: directive arg uses `ParameterRef` without explicit type.

Fix:

```ts
$directive("include", { if: ParameterRef.of("cond", "Boolean!") })
```

## Generated code not refreshed in dev

If generated files are inside `node_modules`, Vite dependency cache may keep stale prebundles.

Fix options:

- restart dev server
- force re-optimize deps
- ensure plugin strategy includes restart when schema hash changes
