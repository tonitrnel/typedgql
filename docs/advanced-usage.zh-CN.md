# typedgql 进阶用法（中文）

本文档补充 `README.md` 中未展开的内容：

- `Subscription` 的执行方式
- 链式 DSL 中的内置方法与指令
- 常见写法对应的 GraphQL 参考片段

## 1. Subscription 用法

前提：你的 Schema 存在 `Subscription` 根类型。  
生成后，`G` 会包含 `subscription()` 方法（如果 schema 没有 subscription 根类型，则不会生成）。

### 1.1 注册 subscriber

```ts
import { setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async (request, variables) => {
  // 你可以在这里接入 graphql-ws / SSE / 自定义实时通道
  // 返回 AsyncIterable<GraphQLResponse>
  return myGraphQLSubscribe(request, variables);
});
```

### 1.2 消费流

```ts
import { G, subscribe } from "@ptdgrp/typedgql";

const selection = G.subscription().postCreated((post) =>
  post.id.title.author((a) => a.id.name),
);

for await (const payload of subscribe(selection)) {
  console.log(payload.postCreated?.title);
}
```

### 1.3 GraphQL 参考

上面大致对应：

```graphql
subscription {
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

## 2. 指令与内置方法

以下方法由生成的 selection 接口提供：

- `$include(condition)`
- `$skip(condition)`
- `$directive(name, args?)`
- `$alias(alias)`
- `$omit(...fields)`
- `$on(child, fragmentName?)`（非 root selection）

注意：`$include/$skip/$directive` 在“有最近字段”时是字段级；否则是 selection 级。

### 2.1 字段级 `$include` / `$skip`

```ts
const selection = G.query().post((p) =>
  p.id
    .title.$include(true)
    .content.$skip(false),
);
```

GraphQL 参考：

```graphql
query {
  post(id: $id) {
    id
    title @include(if: true)
    content @skip(if: false)
  }
}
```

### 2.2 通用 `$directive(name, args?)`

```ts
const selection = G.query()
  .$directive("cacheControl", { maxAge: 60 })
  .posts((p) => p.id.title);
```

GraphQL 参考（示意）：

```graphql
query @cacheControl(maxAge: 60) {
  posts {
    id
    title
  }
}
```

### 2.3 `$alias(alias)`

```ts
const selection = G.query().post((p) =>
  p.title.$alias("postTitle"),
);
```

GraphQL 参考：

```graphql
query {
  post(id: $id) {
    postTitle: title
  }
}
```

### 2.4 `$omit(...fields)`

```ts
const selection = G.query().post((p) =>
  p.id.title.content.$omit("content"),
);
```

GraphQL 参考：

```graphql
query {
  post(id: $id) {
    id
    title
  }
}
```

### 2.5 `$on(...)`（inline fragment / named fragment）

以下示例为“联合类型/接口类型”的伪代码，具体类型名与入口以你的生成结果为准：

```ts
const selection = G.query().search((s) =>
  s.$on(
    G.query().searchResultUser((u) => u.id.name),
    "userFields",
  ),
);
```

GraphQL 参考（示意）：

```graphql
query {
  search {
    ...userFields
  }
}

fragment userFields on User {
  id
  name
}
```

## 3. 参数传递与变量

推荐模式：selection 与变量值解耦。

```ts
const selection = G.query().post((p) => p.id.title);
await execute(selection, { variables: { id: "p2" } });
```

你也可以显式写参数占位：

```ts
const selection = G.query().post(
  { id: ParameterRef.of("postId") },
  (p) => p.id.title,
);
await execute(selection, { variables: { postId: "p2" } });
```
