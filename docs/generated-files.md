---
title: typedgql Generated Files
description: What is generated under __generated and what to import.
last_modified: 2026-03-09T10:30:00Z
---

# typedgql Generated Files

Default output:

- `node_modules/@ptdgrp/typedgql/__generated`

Typical layout:

- `index.ts`
  - re-exports root entries and runtime helpers
  - provides `query$ / mutation$ / subscription$ / fragment$ / G`
- `selections/`
  - one selection type per GraphQL object/interface/union
  - `QuerySelection`, `MutationSelection`, `SubscriptionSelection`, etc.
- `inputs/`
  - generated input object TS types
- `enums/`
  - generated enum TS types
- `enum-input-metadata.ts`
  - runtime metadata for enum/input serialization
- `type-hierarchy.ts`
  - interface/union hierarchy helpers

Recommended import style:

```ts
import { G, execute, subscribe, ShapeOf, VariablesOf } from "@ptdgrp/typedgql";
```

Use direct `__generated/*` imports only when you need specific generated types.
