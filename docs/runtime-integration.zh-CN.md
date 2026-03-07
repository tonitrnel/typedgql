---
title: typedgql 运行时接入指南（中文）
description: 说明 typedgql 在客户端落地时的运行时契约、订阅接入、错误处理、transport 适配与生命周期回收。
last_modified: 2026-03-07T02:05:00Z
---

# typedgql 运行时接入指南（中文）

本文档只讲“运行时如何接”，不讲 schema/codegen 本身。

## 1. 核心契约

### 1.1 `setGraphQLExecutor`

签名（来自 runtime）：

```ts
type GraphQLExecutor = (
  request: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;
```

约束：

- 负责 query/mutation 的一次性请求。
- 输入的 `request` 是完整 GraphQL 文本（已包含 operation + fragments）。
- 返回值应符合 GraphQL response 形状：
  `{"data"?: ..., "errors"?: ...}`。
- 如果返回对象带 `errors`，`execute(...)` 会抛 `GraphQLError`。
- 如果 transport 层失败（网络错误、超时、401 等），应直接 `throw`。

### 1.2 `setGraphQLSubscriber`

签名（来自 runtime）：

```ts
type GraphQLSubscriber = (
  request: string,
  variables: Record<string, unknown>,
) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
```

约束：

- 负责 subscription 的流式请求。
- 必须返回 `AsyncIterable`（或 Promise 包装的 `AsyncIterable`）。
- 流里每个 `yield` 项都应是 GraphQL response 形状：
  `{"data"?: ..., "errors"?: ...}`。
- 任一 payload 含 `errors` 时，`subscribe(...)` 会抛 `GraphQLError` 并终止迭代。
- transport 错误应通过抛异常传播（连接断开、协议错误、鉴权失败等）。

## 2. 最小端到端示例

### 2.1 query/mutation（HTTP）

```ts
import { setGraphQLExecutor } from "@ptdgrp/typedgql";

setGraphQLExecutor(async (request, variables) => {
  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
});
```

### 2.2 subscription（自定义 AsyncIterable transport）

```ts
import { subscription$, subscribe, setGraphQLSubscriber } from "@ptdgrp/typedgql";

setGraphQLSubscriber(async (request, variables) => {
  return createMyAsyncStream({ query: request, variables });
});

const selection = subscription$(
  (s) => s.postCreated((p) => p.id.title.author((a) => a.id.name)),
  "PostCreatedSub",
);

for await (const data of subscribe(selection)) {
  console.log(data.postCreated?.title);
}
```

## 3. 错误处理约定

建议统一以下策略：

1. transport 错误：直接 `throw`。
2. GraphQL 业务错误：返回 `{"errors": [...]}`，由 runtime 抛 `GraphQLError`。
3. 混合响应（`data + errors`）：runtime 仍会按 `errors` 抛异常，不会返回部分 `data`。
4. subscription 流中出现 `errors`：本次迭代抛错并结束流。

示例：

```ts
try {
  const data = await execute(selection, { variables });
} catch (e) {
  // e 可能是 transport error 或 GraphQLError
}
```

## 4. 生成代码 API 地图

默认生成目录：

- `node_modules/@ptdgrp/typedgql/__generated`

你通常只需要这些入口：

1. `@ptdgrp/typedgql`
   - `query$ / mutation$ / subscription$`
   - `fragment$`
   - `execute / subscribe`
   - `setGraphQLExecutor / setGraphQLSubscriber`
   - `G`（聚合入口：`G.query / G.mutation / G.subscription / G.fragment`）
2. `@ptdgrp/typedgql/__generated/selections`
   - `QuerySelection`、`MutationSelection`、`SubscriptionSelection` 及各类型 `XxxSelection`
3. `@ptdgrp/typedgql/__generated/inputs`、`.../enums`
   - 输入类型与枚举类型

## 5. Transport 适配模板

### 5.1 HTTP adapter（query/mutation）

```ts
export const httpExecutor = async (request: string, variables: Record<string, unknown>) => {
  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
```

### 5.2 WebSocket adapter（subscription）

```ts
export const wsSubscriber = async (request: string, variables: Record<string, unknown>) => {
  // 这里返回 AsyncIterable，内部可桥接 graphql-ws / 原生 ws / 任意协议
  return createAsyncIterableFromWs({ query: request, variables });
};
```

### 5.3 AsyncIterable adapter 通用骨架

```ts
export function toAsyncIterable(register: (sink: {
  next: (value: unknown) => void;
  error: (err: unknown) => void;
  complete: () => void;
}) => () => void): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const queue: unknown[] = [];
      let done = false;
      let pending: ((r: IteratorResult<unknown>) => void) | null = null;
      let failure: unknown = null;

      const unsubscribe = register({
        next(value) {
          if (pending) {
            const p = pending;
            pending = null;
            p({ value, done: false });
          } else {
            queue.push(value);
          }
        },
        error(err) {
          failure = err;
          if (pending) {
            const p = pending;
            pending = null;
            p(Promise.reject(err) as never);
          }
        },
        complete() {
          done = true;
          if (pending) {
            const p = pending;
            pending = null;
            p({ value: undefined, done: true });
          }
        },
      });

      return {
        async next() {
          if (failure) throw failure;
          if (queue.length) return { value: queue.shift(), done: false };
          if (done) return { value: undefined, done: true };
          return new Promise<IteratorResult<unknown>>((resolve) => {
            pending = resolve;
          });
        },
        async return() {
          done = true;
          unsubscribe();
          return { value: undefined, done: true };
        },
      };
    },
  };
}
```

## 6. 生命周期与取消订阅

关键点：

- 消费端应在不再需要时调用迭代器 `return()`（例如组件卸载）。
- 适配器应在 `finally` 或 `return()` 中释放底层资源。
- 如果你的协议要求显式发送完成帧（如 `complete_subscription(subscription_id)`），要在清理阶段发送。

示例（协议需要 `complete`）：

```ts
async function* protocolStream(client: MyClient, request: string, variables: Record<string, unknown>) {
  const id = client.start(request, variables);
  try {
    for await (const payload of client.messages(id)) {
      yield payload;
    }
  } finally {
    client.complete_subscription(id);
  }
}
```

## 7. 推荐落地顺序

1. 先接通 `setGraphQLExecutor`（query/mutation）。
2. 再接通 `setGraphQLSubscriber`（subscription + cleanup）。
3. 明确团队错误策略（transport throw / GraphQL errors payload）。
4. 封装项目级 hooks 或 service（如 `useTypedSubscription`）。
