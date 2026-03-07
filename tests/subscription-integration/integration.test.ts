import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { parse } from "graphql";
import { Generator } from "../../src/codegen/generator";
import { loadLocalSchema } from "../../src/codegen/schema-loader";
import { rewriteGeneratedImportsToSrcEntry } from "../helpers/rewrite-generated-imports";
import { ParameterRef } from "../../src/index";

const SCHEMA_FILE = join(
  process.cwd(),
  "tests",
  "subscription-integration",
  "schema.graphql",
);
const GENERATED_DIR = join(process.cwd(), "__generated-subscription-integration-test");
const GENERATED_INDEX_FILE = join(GENERATED_DIR, "index.ts");
const SUBSCRIPTION_SELECTION_FILE = join(
  GENERATED_DIR,
  "selections",
  "subscription-selection.ts",
);

describe("Runtime + codegen integration (subscription)", () => {
  beforeAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });

    const generator = new Generator({
      schemaLoader: () => loadLocalSchema(SCHEMA_FILE),
      targetDir: GENERATED_DIR,
    });
    await generator.generate();
    await rewriteGeneratedImportsToSrcEntry(GENERATED_DIR);
  });

  afterAll(async () => {
    await rm(GENERATED_DIR, { recursive: true, force: true });
  });

  it("supports gateway-style usage with G.subscription(...) and for-await subscribe", async () => {
    const runtimeMod = (await import(pathToFileURL(GENERATED_INDEX_FILE).href)) as {
      subscribe: any;
    };
    const selectionMod = (await import(pathToFileURL(SUBSCRIPTION_SELECTION_FILE).href)) as {
      subscription$: any;
    };

    const G = {
      subscription: selectionMod.subscription$,
    } as const;

    const selection = G.subscription(
      (s: any) => s.postCreated((post: any) => post.id.title.author((a: any) => a.id.name)),
      "PostCreatedSub",
    );

    const requests: string[] = [];
    const payloadTitles: string[] = [];

    async function* subscriber(request: string): AsyncIterable<any> {
      expect(() => parse(request)).not.toThrow();
      expect(request).toContain("subscription PostCreatedSub");
      expect(request).toContain("postCreated");
      expect(request).toContain("author");
      requests.push(request);
      yield {
        data: {
          postCreated: {
            id: "p1",
            title: "Hello Subscription",
            author: { id: "u1", name: "Ash" },
          },
        },
      };
    }

    for await (const payload of runtimeMod.subscribe(selection, { subscriber })) {
      payloadTitles.push(payload.postCreated?.title);
    }

    expect(payloadTitles).toEqual(["Hello Subscription"]);
    expect(requests).toHaveLength(1);
  });

  it("passes variables to subscriber for parameterized subscription fields", async () => {
    const runtimeMod = (await import(pathToFileURL(GENERATED_INDEX_FILE).href)) as {
      subscribe: any;
    };
    const selectionMod = (await import(pathToFileURL(SUBSCRIPTION_SELECTION_FILE).href)) as {
      subscription$: any;
    };

    const selection = selectionMod.subscription$(
      (s: any) =>
        s.postCreated({ id: ParameterRef.of("postId") }, (post: any) => post.id),
      "PostCreatedWithVar",
    );

    let receivedVariables: Record<string, unknown> | undefined;

    async function* subscriber(
      request: string,
      variables: Record<string, unknown>,
    ): AsyncIterable<any> {
      expect(() => parse(request)).not.toThrow();
      expect(request).toContain("subscription PostCreatedWithVar");
      expect(request).toContain("$postId: ID!");
      expect(request).toContain("postCreated(id: $postId)");
      expect(variables).toEqual({ postId: "p1" });
      receivedVariables = variables;
      yield {
        data: {
          postCreated: {
            id: "p1",
          },
        },
      };
    }

    const outputs: any[] = [];
    for await (const payload of runtimeMod.subscribe(selection, {
      subscriber,
      variables: { postId: "p1" },
    })) {
      outputs.push(payload);
    }

    expect(receivedVariables).toEqual({ postId: "p1" });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].postCreated?.id).toBe("p1");
  });

  it("normalizes malformed GraphQL errors from subscriber payload", async () => {
    const runtimeMod = (await import(pathToFileURL(GENERATED_INDEX_FILE).href)) as {
      subscribe: any;
    };
    const selectionMod = (await import(pathToFileURL(SUBSCRIPTION_SELECTION_FILE).href)) as {
      subscription$: any;
    };

    const selection = selectionMod.subscription$(
      (s: any) => s.postCreated((p: any) => p.id),
      "MalformedErrors",
    );

    async function* subscriber(_request: string): AsyncIterable<unknown> {
      yield { errors: ["bad"] };
    }

    let caught: unknown;
    try {
      for await (const _payload of runtimeMod.subscribe(selection, { subscriber })) {
        // no-op
      }
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught).toHaveProperty("errors");
    expect((caught as { errors: Array<{ message: string }> }).errors[0]?.message).toBe("bad");
  });
});
