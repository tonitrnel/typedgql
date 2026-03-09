---
title: typedgql Variables Semantics
description: Default propagation, explicit override/merge, and conflict rules.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Variables Semantics

## 1. Default propagation

If a field has declared args and you do not pass `args`, typedgql auto-binds all declared args to same-name variables.

```ts
const s = G.query((q) => q.searchUsers((u) => u.id.name));
// => searchUsers(filter: $filter, tags: $tags, role: $role)
```

## 2. Explicit args are merged

Explicit `args` override provided keys, while unspecified keys keep auto propagation.

```ts
const s = G.query((q) =>
  q.searchUsers({ filter: ParameterRef.of("f") }, (u) => u.id),
);
// => filter: $f, tags: $tags, role: $role
```

## 3. `ParameterRef`

- Field arg slot: usually `ParameterRef.of("name")`
- Directive/nested slot: usually include type `ParameterRef.of("name", "Boolean!")`

## 4. Conflict rules

### Same variable name + different GraphQL types

Throws with both sides:

```txt
Variable '$v' has conflicting GraphQL types: first 'Int!' at field 'Query.a'.value, then 'String!' at field 'Query.b'.value
```

### Same variable name + same GraphQL type

Allowed. The variable is registered once.
