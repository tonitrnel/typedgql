# @ptdgrp/typedgql

`typedgql` 是一个面向 TypeScript 的 GraphQL 客户端代码生成与运行时库，目标是提供“端到端类型安全 + 链式查询构建体验”。

## 特性

- 基于 GraphQL Schema 生成强类型客户端代码
- 链式 DSL 构建查询与变更，例如 `G.query().posts((p) => p.id.title)`
- 查询选择与请求变量分离：先构建 selection，再在 `execute` 时传 `variables`
- 零运行时三方依赖（仅依赖你提供的 GraphQL executor）
- 支持 ESM/CJS
- 默认生成到 `node_modules/@ptdgrp/typedgql/__generated`

## 安装

```bash
pnpm add @ptdgrp/typedgql
pnpm add -D graphql typescript
```

## 用法

进阶内容（Subscription、指令、GraphQL 对照）见：

- [typedgql 进阶用法（中文）](./docs/advanced-usage.zh-CN.md)

### 1. Vite 插件方式（推荐）

在 `vite.config.ts` 中配置：

```ts
import { defineConfig } from "vite";
import { typedgql } from "@ptdgrp/typedgql/vite";

export default defineConfig({
  plugins: [
    typedgql({ schema: "./schema.graphql" }),
    // 或远程 schema:
    // typedgql({ schema: "http://localhost:4000/graphql" }),
  ],
});
```

启动 Vite 时会自动生成代码；schema 变更后会自动重新生成。

### 2. Node 手动生成

```ts
import { Generator, loadLocalSchema } from "@ptdgrp/typedgql/node";

const generator = new Generator({
  schemaLoader: () => loadLocalSchema("./schema.graphql"),
});

await generator.generate();
```

### 3. 运行时执行（基础示例）

```ts
import { G, execute, setGraphQLExecutor } from "@ptdgrp/typedgql";

setGraphQLExecutor(async (request, variables) => {
  const res = await fetch("http://localhost:8080/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: request, variables }),
  });
  return res.json();
});

const selection = G.query().posts((post) =>
  post.id.title.author((author) => author.id.name),
);

const data = await execute(selection);
```

### 4. 带变量查询（推荐写法）

`selection` 与变量传值解耦：selection 可复用，变量在执行时传入。

```ts
import { G, execute } from "@ptdgrp/typedgql";

const selection = G.query().post((post) => post.id.title.content);

const data = await execute(selection, {
  variables: { id: "p2" },
});
```

### 5. 显式变量占位（可选）

```ts
import { G, execute, ParameterRef } from "@ptdgrp/typedgql";

const selection = G.query().post(
  { id: ParameterRef.of("postId") },
  (post) => post.id.title,
);

const data = await execute(selection, {
  variables: { postId: "p2" },
});
```

## License

MIT，详见 [LICENSE](./LICENSE)。

## Credits

本项目基于 [graphql-ts-client](https://github.com/babyfish-ct/graphql-ts-client) 的设计思路演进，感谢 [ChenTao](https://github.com/babyfish-ct) 提供的优秀基础。
