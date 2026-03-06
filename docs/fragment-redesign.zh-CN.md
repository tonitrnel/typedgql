# Fragment API（Beta 设计）

## 目标

统一 fragment 相关 API，明确职责：

- `$on`：只做 inline fragment
- `fragment$`：创建 named fragment
- `$use`：使用 named fragment

## 对外 API

### `fragment$`

```ts
fragment$(typeName, builder, fragmentName?)
```

- `typeName`: GraphQL type condition（如 `"User"`）
- `builder`: 选择链构造函数
- `fragmentName?`: 可选命名，不传则自动命名

示例：

```ts
const UserBase = fragment$("User", (u) => u.id.name.email, "UserBase");

const AutoNamedUser = fragment$("User", (u) => u.id.name.email);
```

等价入口：

```ts
const UserBase2 = G.fragment("User", (u) => u.id.name.email, "UserBase");
```

### `$use`

```ts
selection.$use(fragmentRef);
```

示例：

```ts
const UserBase = fragment$("User", (u) => u.id.name.email, "UserBase");

const selection = G.query((q) => q.viewer((u) => u.$use(UserBase)));
```

输出：

- selection 文本：`... UserBase`（或自动重命名后的名称）
- fragment 文本：`fragment UserBase on User { id name email }`

### `$on`

```ts
selection.$on(typeName, builder);
selection.$on(builder); // 同类型 inline
```

示例：

```ts
// 同类型 inline（可省 type condition）
u.$on((it) => it.id.name);

// 显式 type condition
node.$on("User", (u) => u.id.email);
node.$on("Post", (p) => p.id.title);
```

## 与选择链函数复用配合

```ts
const selectUserBase = (u: UserSelection) => u.id.name.email;
const UserBase = fragment$("User", selectUserBase, "UserBase");

const selection = G.query((q) => q.viewer((u) => u.$use(UserBase)));
```

## 多态字段对齐示例

GraphQL：

```graphql
fragment safeDifferingFields on Pet {
  ... on Dog {
    volume: barkVolume
  }
  ... on Cat {
    volume: meowVolume
  }
}
```

TypedGQL：

```ts
const safeDifferingFields = fragment$(
  "Pet",
  (p) =>
    p
      .$on("Dog", (it) => it.barkVolume.$alias("volume"))
      .$on("Cat", (it) => it.meowVolume.$alias("volume")),
  "safeDifferingFields",
);
```

GraphQL:

```graphql
query withNestedFragments {
  user(id: 4) {
    friends(first: 10) {
      ...friendFields
    }
    mutualFriends(first: 10) {
      ...friendFields
    }
  }
}

fragment friendFields on User {
  id
  name
  ...standardProfilePic
}

fragment standardProfilePic on User {
  profilePic(size: 50)
}
```

TypedGQL：

```ts
const standardProfilePic = fragment$("User", (it) =>
  it.profilePic({ size: 50 }),
  "standardProfilePic",
);
const friendFields = fragment$("User", (it) =>
  it.id.name.$use(standardProfilePic),
  "friendFields",
);
const withNestedFragments = query$((q) =>
  q.user({ id: 4 }, (it) =>
    it
      .friends({ first: 10 }, (it) => it.$use(friendFields))
      .mutualFriends({ first: 10 }, (it) => it.$use(friendFields)),
  ),
);
```
