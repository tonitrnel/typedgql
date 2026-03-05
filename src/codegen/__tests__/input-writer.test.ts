import { describe, expect, it } from "vitest";
import type { WriteStream } from "fs";
import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLString,
} from "graphql";
import { InputWriter } from "../writers/input";
import type { CodegenOptions } from "../options";

function makeStream(): { stream: WriteStream; getOutput: () => string } {
  let buf = "";
  const stream = {
    write: (chunk: string) => {
      buf += chunk;
      return true;
    },
  } as unknown as WriteStream;
  return { stream, getOutput: () => buf };
}

const baseOptions: CodegenOptions = {
  schemaLoader: async () => {
    throw new Error("not used");
  },
};

describe("InputWriter", () => {
  it("emits regular input fields with readonly/optional handling", () => {
    const Input = new GraphQLInputObjectType({
      name: "UpdateUserInput",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: GraphQLString },
      },
    });
    const { stream, getOutput } = makeStream();
    new InputWriter(Input, stream, baseOptions).write();

    const output = getOutput();
    expect(output).toContain("export type UpdateUserInput");
    expect(output).toContain("readonly id: string;");
    expect(output).toContain("readonly name?: string;");
  });

  it("handles oneOf inputs including empty oneOf object", () => {
    const OneOf = new GraphQLInputObjectType({
      name: "LookupInput",
      isOneOf: true,
      fields: {
        id: { type: GraphQLString },
        email: { type: GraphQLString },
      },
    });
    const { stream: s1, getOutput: o1 } = makeStream();
    new InputWriter(OneOf, s1, baseOptions).write();
    const out1 = o1();
    expect(out1).toContain("id: Exclude<string, undefined>;");
    expect(out1).toContain("email?: never;");
    expect(out1).toContain(" | ");

    const EmptyOneOf = new GraphQLInputObjectType({
      name: "EmptyOneOfInput",
      isOneOf: true,
      fields: {},
    });
    const { stream: s2, getOutput: o2 } = makeStream();
    new InputWriter(EmptyOneOf, s2, baseOptions).write();
    expect(o2()).toContain("export type EmptyOneOfInput = {}");
  });

  it("covers importingBehavior self/same_dir/other_dir branches", () => {
    const Nested = new GraphQLInputObjectType({
      name: "NestedInput",
      fields: {
        value: { type: GraphQLString },
      },
    });
    const Root = new GraphQLInputObjectType({
      name: "RootInput",
      fields: {
        nested: { type: Nested },
      },
    });
    class InputWriterProbe extends InputWriter {
      behavior(type: any) {
        return this.importingBehavior(type);
      }
    }
    const { stream } = makeStream();
    const writer = new InputWriterProbe(Root, stream, baseOptions);
    expect(writer.behavior(Root)).toBe("self");
    expect(writer.behavior(Nested)).toBe("same_dir");
    expect(writer.behavior(GraphQLString)).toBe("other_dir");
  });
});
