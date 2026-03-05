import { describe, expect, it } from "vitest";
import { GraphQLEnumType } from "graphql";
import { EnumWriter } from "../writers/enum";
import type { CodegenOptions } from "../options";
import type { WriteStream } from "fs";

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

const enumType = new GraphQLEnumType({
  name: "Role",
  values: {
    ADMIN: { value: "ADMIN" },
    USER: { value: "USER" },
    GUEST: { value: "GUEST" },
    OPERATOR: { value: "OPERATOR" },
  },
});

function options(tsEnum?: CodegenOptions["tsEnum"]): CodegenOptions {
  return {
    schemaLoader: async () => {
      throw new Error("not used");
    },
    tsEnum,
  };
}

describe("EnumWriter", () => {
  it("emits string-literal union when tsEnum is disabled", () => {
    const { stream, getOutput } = makeStream();
    new EnumWriter(enumType, stream, options()).write();

    const out = getOutput();
    expect(out).toContain("export type Role =");
    expect(out).toContain("'ADMIN'");
    expect(out).toContain("'USER'");
    expect(out).toContain(" | ");
  });

  it("emits TypeScript enum for tsEnum=true and tsEnum='number'", () => {
    const { stream: s1, getOutput: o1 } = makeStream();
    new EnumWriter(enumType, s1, options(true)).write();
    expect(o1()).toContain("export enum Role");
    expect(o1()).toContain("ADMIN");
    expect(o1()).not.toContain("= 'ADMIN'");

    const { stream: s2, getOutput: o2 } = makeStream();
    new EnumWriter(enumType, s2, options("number")).write();
    expect(o2()).toContain("export enum Role");
    expect(o2()).toContain("USER");
    expect(o2()).not.toContain("= 'USER'");
  });

  it("emits string enum assignments for tsEnum='string'", () => {
    const { stream, getOutput } = makeStream();
    new EnumWriter(enumType, stream, options("string")).write();

    const out = getOutput();
    expect(out).toContain("export enum Role");
    expect(out).toContain("ADMIN = 'ADMIN'");
    expect(out).toContain("USER = 'USER'");
  });
});
