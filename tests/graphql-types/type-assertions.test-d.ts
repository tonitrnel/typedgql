import { expectAssignable, expectError, expectType } from "tsd";
import { fragment$ } from "./__gen__/index";
import { query$ } from "./__gen__/selections/query-selection";
import { mutation$ } from "./__gen__/selections/mutation-selection";
import { subscription$ } from "./__gen__/selections/subscription-selection";
import type { VariablesOf, ShapeOf } from "../../src/index";
import { ParameterRef } from "../../src/index";

const postSelection = query$((q) => q.post({ id: "p1" }, (p) => p.id.title));
expectType<string>(postSelection.toString());
expectType<string>(postSelection.toFragmentString());
expectType<string>(postSelection.toJSON());

const userBaseFragment = fragment$("User", (u) => u.id.name, "UserBase");
query$((q) => q.viewer((u) => u.$use(userBaseFragment)));
expectError(fragment$("NotExistingType", (_x: never) => _x));
const postBaseFragment = fragment$("Post", (p) => p.id.title, "PostBase");

// $on typing
query$((q) => q.viewer((u) => u.$on((it) => it.id.name)));
query$((q) => q.viewer((u) => u.$on("User", (it) => it.id.email)));
expectError(query$((q) => q.viewer((u) => u.$on("Post", (it) => it))));
expectError(query$((q) => q.viewer((u) => u.$on("User", (it) => it.missing))));
expectError(query$((q) => q.viewer((u) => u.$on("User"))));
const viewerWithOn = query$((q) => q.viewer((u) => u.$on((it) => it.id.email)));
expectAssignable<{
  readonly viewer: { readonly id: string; readonly email: string };
}>(null as unknown as ShapeOf<typeof viewerWithOn>);

// $use typing
query$((q) => q.viewer((u) => u.$use(userBaseFragment)));
query$((q) => q.viewer((u) => u.$use(() => userBaseFragment)));
expectError(query$((q) => q.viewer((u) => u.$use(postBaseFragment))));
expectError(query$((q) => q.viewer((u) => u.$use(u.id))));
const viewerWithUse = query$((q) => q.viewer((u) => u.$use(userBaseFragment)));
expectAssignable<{
  readonly viewer: { readonly id: string; readonly name: string };
}>(null as unknown as ShapeOf<typeof viewerWithUse>);
const postWithUseVar = query$((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) =>
    p.author((a) => a.$use(userBaseFragment)),
  ),
);
const postWithUseVars = null as unknown as VariablesOf<typeof postWithUseVar>;
expectAssignable<string>(postWithUseVars.postId);

const postWithOnVar = query$((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) =>
    p.author((a) => a.$on((it) => it.id.name)),
  ),
);
const postWithOnVars = null as unknown as VariablesOf<typeof postWithOnVar>;
expectAssignable<string>(postWithOnVars.postId);

query$((q) => q.post({ id: ParameterRef.of("postId") }, (p) => p.id));
query$((q) => q.viewer((u) => u.id.name.email));
query$((q) =>
  q.lookupUser({ input: { email: "neo@example.com" } }, (u) => u.id.name),
);
mutation$((m) =>
  m.updateUser({ input: { id: "u1", role: "ADMIN" } }, (u) => u.id.name),
);
subscription$((s) => s.postUpdated({ id: "p1" }, (p) => p.id.title));
subscription$((s) => s.userOnline((u) => u.id.email));

expectError(query$((q) => q.post({}, (p) => p.id)));
expectError(query$((q) => q.post({ id: 123 }, (p) => p.id)));
expectError(query$((q) => q.viewer()));
expectError(query$((q) => q.viewer((u) => u.name((x: unknown) => x))));
expectError(
  mutation$((m) => m.updateUser({ input: { name: "Neo" } }, (u) => u.id)),
);
expectError(
  mutation$((m) =>
    m.updateUser({ input: { id: "u1", role: "ROOT" } }, (u) => u.id),
  ),
);
expectError(subscription$((s) => s.postUpdated({}, (p) => p.id)));
expectError(subscription$((s) => s.postUpdated({ id: 123 }, (p) => p.id)));
expectError(subscription$((s) => s.userOnline()));
expectError(
  subscription$((s) => s.userOnline((u) => u.email((x: unknown) => x))),
);
expectError(query$((q) => q.post({ id: "p1" }, (p) => p.missingField)));
expectError(
  query$((q) => q.post({ id: ParameterRef.of("postId", 123) }, (p) => p.id)),
);
expectError(
  mutation$((m) =>
    m.updateUser(
      { input: { id: ParameterRef.of("uid"), name: 123 } },
      (u) => u.id,
    ),
  ),
);

const viewerSelection = query$((q) => q.viewer((u) => u.id.name));
expectAssignable<{
  readonly viewer: { readonly id: string; readonly name: string };
}>(null as unknown as ShapeOf<typeof viewerSelection>);

expectAssignable<{
  readonly post?: { readonly id: string; readonly title: string };
}>(null as unknown as ShapeOf<typeof postSelection>);

const lookupSelection = query$((q) =>
  q.lookupUser({ input: { id: "u1" } }, (u) => u.id.email),
);
expectAssignable<{
  readonly lookupUser?: { readonly id: string; readonly email: string };
}>(null as unknown as ShapeOf<typeof lookupSelection>);

const subscriptionSelection = subscription$((s) =>
  s.postUpdated({ id: "p1" }, (p) => p.id.author((a) => a.id.name)),
);
expectAssignable<{
  readonly postUpdated: {
    readonly id: string;
    readonly author: { readonly id: string; readonly name: string };
  };
}>(null as unknown as ShapeOf<typeof subscriptionSelection>);

const postWithVariable = query$((q) =>
  q.post({ id: ParameterRef.of("postId") }, (p) => p.id),
);
const postVars = null as unknown as VariablesOf<typeof postWithVariable>;
expectAssignable<string>(postVars.postId);

const subscriptionWithVariable = subscription$((s) =>
  s.postUpdated({ id: ParameterRef.of("subPostId") }, (p) => p.id),
);
const subscriptionVars = null as unknown as VariablesOf<
  typeof subscriptionWithVariable
>;
expectAssignable<string>(subscriptionVars.subPostId);

const updateWithVariables = mutation$((m) =>
  m.updateUser(
    {
      input: ParameterRef.of("payload", "UpdateUserInput!"),
    },
    (u) => u.id.name,
  ),
);
const updateVars = null as unknown as VariablesOf<typeof updateWithVariables>;
expectAssignable<string>(updateVars.payload.id);
expectAssignable<string | undefined>(updateVars.payload.name);
expectError(updateVars.payload.id.toFixed());
expectError(updateVars.payload.name?.toFixed());
expectError(updateVars.payload.role?.toFixed());
