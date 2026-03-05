import { describe, expect, it } from "vitest";
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import type { WriteStream } from "fs";
import { EnumInputMetadataWriter } from "../writers/enum-input-metadata";
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

describe("EnumInputMetadataWriter imports", () => {
  it("emits stable builder import from runtime entry", () => {
    const Role = new GraphQLEnumType({
      name: "Role",
      values: { ADMIN: { value: "ADMIN" } },
    });
    const UpdateUserInput = new GraphQLInputObjectType({
      name: "UpdateUserInput",
      fields: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        role: { type: Role },
      },
    });
    const Query = new GraphQLObjectType({
      name: "Query",
      fields: {
        ping: { type: GraphQLString },
      },
    });
    const schema = new GraphQLSchema({
      query: Query,
      types: [Role, UpdateUserInput],
    });

    const { stream, getOutput } = makeStream();
    const writer = new EnumInputMetadataWriter(schema, stream, baseOptions);
    writer.write();
    const output = getOutput();

    expect(output).toContain("import { EnumInputMetadataBuilder } from '../dist/index.mjs';");
    expect(output).toContain("const builder = new EnumInputMetadataBuilder();");
  });
});
