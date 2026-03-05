import { expectAssignable, expectError, expectType } from "tsd";
import { query$ } from "./__gen__/selections/query-selection";
import { mutation$ } from "./__gen__/selections/mutation-selection";
import type { VariablesOf, ShapeOf } from "../../src/index";
import { ParameterRef } from "../../src/index";

const postSelection = query$.post({ id: "p1" }, (p) => p.id.title);
expectType<string>(postSelection.toString());
expectType<string>(postSelection.toFragmentString());
expectType<string>(postSelection.toJSON());

query$.post({ id: ParameterRef.of("postId") }, (p) => p.id);
query$.viewer((u) => u.id.name.email);
query$.lookupUser({ input: { email: "neo@example.com" } }, (u) => u.id.name);
mutation$.updateUser({ input: { id: "u1", role: "ADMIN" } }, (u) => u.id.name);

expectError(query$.post({}, (p) => p.id));
expectError(query$.post({ id: 123 }, (p) => p.id));
expectError(query$.viewer());
expectError(query$.viewer((u) => u.name((x: any) => x)));
expectError(mutation$.updateUser({ input: { name: "Neo" } }, (u) => u.id));
expectError(
  mutation$.updateUser({ input: { id: "u1", role: "ROOT" } }, (u) => u.id),
);
expectError(query$.post({ id: "p1" }, (p) => p.missingField));
expectError(query$.post({ id: ParameterRef.of("postId", 123) }, (p) => p.id));
expectError(
  mutation$.updateUser(
    { input: { id: ParameterRef.of("uid"), name: 123 } },
    (u) => u.id,
  ),
);

const viewerSelection = query$.viewer((u) => u.id.name);
expectAssignable<{
  readonly viewer: { readonly id: string; readonly name: string };
}>(null as unknown as ShapeOf<typeof viewerSelection>);

expectAssignable<{
  readonly post?: { readonly id: string; readonly title: string };
}>(null as unknown as ShapeOf<typeof postSelection>);

const lookupSelection = query$.lookupUser(
  { input: { id: "u1" } },
  (u) => u.id.email,
);
expectAssignable<{
  readonly lookupUser?: { readonly id: string; readonly email: string };
}>(null as unknown as ShapeOf<typeof lookupSelection>);

const postWithVariable = query$.post(
  { id: ParameterRef.of("postId") },
  (p) => p.id,
);
const postVars = null as unknown as VariablesOf<typeof postWithVariable>;
expectAssignable<string>(postVars.postId);

const updateWithVariables = mutation$.updateUser(
  {
    input: ParameterRef.of("payload", "UpdateUserInput!"),
  },
  (u) => u.id.name,
);
const updateVars = null as unknown as VariablesOf<typeof updateWithVariables>;
expectAssignable<{
  payload: {
    readonly id: any;
    readonly name?: any;
    readonly role?: any;
  };
}>(updateVars);
