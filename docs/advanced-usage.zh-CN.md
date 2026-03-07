---
title: typedgql 进阶用法（中文）
description: typedgql 的进阶 API 与示例，包括 fragment、inline fragment、subscription、指令和类型提取。
last_modified: 2026-03-07T01:19:00Z
---

# typedgql 进阶用法（中文）

本文档补充 `README.zh-CN.md` 的基础内容，重点覆盖：

- `query$ / mutation$ / subscription$` 与操作命名
- `fragment$`、`$on`、`$use` 的定位与配合
- `Subscription` 执行流程
- 指令与内置方法

## 1. 根操作与命名

你可以直接使用根选择器函数：

```ts
import { query$, mutation$, subscription$ } from "@ptdgrp/typedgql";

const q1 = query$((q) => q.posts((p) => p.id.title));
const q2 = query$((q) => q.posts((p) => p.id.title), "PostsQuery");
```

也可以通过聚合入口 `G` 调用（等价）：

```ts
import { G } from "@ptdgrp/typedgql";

const q = G.query((x) => x.posts((p) => p.id.title), "PostsQuery");
```

## 2. fragment / inline fragment

### 2.1 `fragment$`（命名 fragment）

```ts
import { fragment$, query$ } from "@ptdgrp/typedgql";

const userBase = fragment$("User", (u) => u.id.name, "UserBase");

const selection = query$((q) => q.viewer((u) => u.$use(userBase)));
```

对应 GraphQL：

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

### 2.2 `$on`（inline fragment）

`$on` 用于 inline fragment，不会生成单独的 `fragment Xxx on ...` 定义。

两种调用形式的区别：

- `$on(builder)`：不指定类型名，沿用当前 selection 的类型上下文（常用于“同类型补字段”）。
- `$on(typeName, builder)`：显式指定目标实现类型/成员类型（常用于接口或联合的类型分支）。

最小对照：

```ts
query$((q) =>
  q.viewer((u) =>
    u.$on((it) => it.id.name), // 不切换类型，仅追加当前类型字段
  ),
);

query$((q) =>
  q.search((node) =>
    node.$on("User", (u) => u.id.name), // 显式切到 User 分支
  ),
);
```

对应 GraphQL（最小对照）：

```graphql
query {
  viewer {
    ... {
      id
      name
    }
  }
}

query {
  search {
    ... on User {
      id
      name
    }
  }
}
```

```ts
const selection = query$(
  (q) =>
    q.search((node) =>
      node.$on("User", (u) => u.id.name).$on("Page", (p) => p.id.handle),
    ),
  "InlineFragmentTyping",
);
```

对应 GraphQL：

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

## 3. Subscription 用法

前提：schema 存在 `Subscription` 根类型。

### 3.1 注册 subscriber

```ts
import { setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async (request, variables) => {
  // 接入 graphql-ws / SSE / 自定义实时通道
  // 返回 AsyncIterable<GraphQLResponse>
  return myGraphQLSubscribe(request, variables);
});
```

### 3.2 消费流

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

对应 GraphQL：

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

## 4. 指令与内置方法

常用内置方法：

- `$include(condition)`
- `$skip(condition)`
- `$directive(name, args?)`
- `$alias(alias)`
- `$omit(...fields)`
- `$on(builder)` / `$on(typeName, builder)`
- `$use(fragment)`（支持 `ValueOrThunk`，即值或 `() => 值`）

注意：`$include/$skip/$directive` 在“有最近字段”时是字段级，否则是 selection 级。

### 4.1 字段级 `$include` / `$skip`

```ts
const selection = query$((q) =>
  q.post({ id: "p1" }, (p) => p.id.title.$include(true).content.$skip(false)),
);
```

对应 GraphQL：

```graphql
query {
  post(id: "p1") {
    id
    title @include(if: true)
    content @skip(if: false)
  }
}
```

### 4.2 selection 级 `$directive`

```ts
const selection = query$((q) =>
  q.$directive("cacheControl", { maxAge: 60 }).posts((p) => p.id.title),
);
```

### 4.3 `$alias` / `$omit`

```ts
const selection = query$((q) =>
  q.post({ id: "p1" }, (p) =>
    p.id.title.$alias("postTitle").content.$omit("content"),
  ),
);
```

## 5. 参数与变量

推荐：selection 与变量值解耦。

```ts
import { query$, execute } from "@ptdgrp/typedgql";

const selection = query$((q) => q.post({ id: "p1" }, (p) => p.id.title));

await execute(selection);
```

使用变量占位：

```ts
import { query$, execute, ParameterRef } from "@ptdgrp/typedgql";

const selection = query$((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) => p.id.title),
);

await execute(selection, { variables: { postId: "p2" } });
```

## 6. 如何提取 Fragment 的类型

`fragment$` 返回的是 `FragmentRef`。如果你要提取它的结果类型/变量类型，直接从 `selection` 上取即可：

```ts
import { fragment$, ShapeOf, VariablesOf } from "@ptdgrp/typedgql";

const userBase = fragment$("User", (u) => u.id.name, "UserBase");

type UserBaseShape = ShapeOf<typeof userBase.selection>;
type UserBaseVariables = VariablesOf<typeof userBase.selection>;
```
