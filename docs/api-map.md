---
title: typedgql API Map
description: High-frequency API surface and when to use each entry.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql API Map

## Root builders

- `query$(builder, operationName?)`: build query selection.
- `mutation$(builder, operationName?)`: build mutation selection.
- `subscription$(builder, operationName?)`: build subscription selection.
- `G.query / G.mutation / G.subscription`: aggregated equivalents.

## Fragments

- `fragment$(typeName, builder, fragmentName?)`: create named fragment.
- `G.fragment(...)`: aggregated equivalent.
- `selection.$use(fragmentRef)`: spread named fragment.
- `selection.$on(builder)` / `selection.$on(typeName, builder)`: inline fragment.

## Variables and type helpers

- `ParameterRef.of(name, typeRef?)`: bind argument to a variable.
- `ShapeOf<TSelection>`: infer result data shape.
- `VariablesOf<TSelection>`: infer variables shape.

## Runtime adapters

- `setGraphQLExecutor(executor)`: query/mutation transport.
- `setGraphQLSubscriber(subscriber)`: subscription transport.
- `execute(selection, { variables? })`
- `subscribe(selection, { variables? })`

## Selection built-ins

- `$alias(name)`
- `$directive(name, args?)`
- `$include(condition)`
- `$skip(condition)`
- `$omit(...fieldNames)`
