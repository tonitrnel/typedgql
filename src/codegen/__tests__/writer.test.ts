import { describe, expect, it } from "vitest";
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLString,
  GraphQLUnionType,
} from "graphql";
import { Writer, type ImportingBehavior } from "../writer";
import type { CodegenOptions } from "../options";

class MemoryWriteStream {
  private chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(String(chunk));
    return true;
  }

  toString() {
    return this.chunks.join("");
  }
}

class TestWriter extends Writer {
  constructor(
    stream: MemoryWriteStream,
    options: CodegenOptions,
    private readonly impl: {
      readonly prepare?: (writer: TestWriter) => void;
      readonly code: (writer: TestWriter) => void;
      readonly importBehavior?: (name: string) => ImportingBehavior;
      readonly globalDir?: boolean;
    },
  ) {
    super(stream as any, options);
  }

  protected prepareImports(): void {
    this.impl.prepare?.(this);
  }

  protected writeCode(): void {
    this.impl.code(this);
  }

  protected importingBehavior(type: any): ImportingBehavior {
    return this.impl.importBehavior?.(type.name) ?? "other_dir";
  }

  protected isUnderGlobalDir(): boolean {
    return this.impl.globalDir ?? false;
  }

  // expose protected members for branch testing
  addImport(stmt: string) {
    this.importStatement(stmt);
  }
  addType(type: any) {
    this.importType(type);
  }
  out(value: string) {
    this.text(value);
  }
  renderType(type: any, objectRender?: any) {
    this.typeRef(type, objectRender);
  }
  renderGqlType(type: any) {
    this.gqlTypeRef(type);
  }
  leaveScope() {
    this.leave();
  }
}

const TestInput = new GraphQLInputObjectType({
  name: "TestInput",
  fields: {
    value: { type: GraphQLString },
  },
});

const TestEnum = new GraphQLEnumType({
  name: "TestEnum",
  values: {
    A: { value: "A" },
    B: { value: "B" },
  },
});

const TestNode = new GraphQLObjectType({
  name: "TestNode",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
  },
});

const TestUnion = new GraphQLUnionType({
  name: "TestUnion",
  types: [TestNode],
  resolveType: () => TestNode,
});

function options(
  override?: Partial<CodegenOptions>,
): CodegenOptions {
  return {
    schemaLoader: async () => {
      throw new Error("not used");
    },
    ...override,
  };
}

describe("Writer", () => {
  it("writes normalized imports and mapped type imports", () => {
    const stream = new MemoryWriteStream();
    const writer = new TestWriter(
      stream,
      options({
        scalarTypeMap: {
          Decimal: "Decimal",
          Big: "Big",
        },
        scalarTypeDeclarations: `
export type Decimal = number;
export type Big = bigint;
`,
      }),
      {
        prepare: (w) => {
          w.addImport("import { z } from 'zlib'\n");
          w.addImport("import { a } from 'alpha';");
          w.addType(TestInput);
          w.addType(TestEnum);
          w.addType(new GraphQLScalarType({ name: "Decimal" }));
          w.addType(new GraphQLScalarType({ name: "Big" }));
        },
        code: (w) => {
          w.out("export const ok = true;\n");
        },
      },
    );

    writer.write();
    const text = stream.toString();
    expect(text).toContain("import { z } from 'zlib';");
    expect(text).toContain("import { a } from 'alpha';");
    expect(text).toContain("import type {TestInput} from '../inputs';");
    expect(text).toContain("import type {TestEnum} from '../enums';");
    expect(text).toContain("import type { UserScalarTypes } from '../scalar-types';");
    expect(text).toContain("\nexport const ok = true;\n");

    expect(text.indexOf("import { a } from 'alpha';")).toBeLessThan(
      text.indexOf("import { z } from 'zlib';"),
    );
    expect(text.indexOf("import type {TestEnum} from '../enums';")).toBeLessThan(
      text.indexOf("import type {TestInput} from '../inputs';"),
    );
  });

  it("supports global-dir import paths and skips self imports", () => {
    const localInput = new GraphQLInputObjectType({
      name: "LocalInput",
      fields: { x: { type: GraphQLString } },
    });
    const remoteEnum = new GraphQLEnumType({
      name: "RemoteEnum",
      values: { X: { value: "X" } },
    });
    const stream = new MemoryWriteStream();
    const writer = new TestWriter(
      stream,
      options({
        scalarTypeMap: {
          Money: "Money",
        },
        scalarTypeDeclarations: `export type Money = number;`,
      }),
      {
        prepare: (w) => {
          w.addType(localInput);
          w.addType(remoteEnum);
          w.addType(new GraphQLScalarType({ name: "Money" }));
        },
        importBehavior: (name) => (name === "LocalInput" ? "self" : "other_dir"),
        globalDir: true,
        code: (w) => {
          w.out("export type _T = 1;\n");
        },
      },
    );

    writer.write();
    const text = stream.toString();
    expect(text).not.toContain("LocalInput");
    expect(text).toContain("import type {RemoteEnum} from './enums';");
    expect(text).toContain("import type { UserScalarTypes } from './scalar-types';");
  });

  it("renders GraphQL/TS types and hits guard errors", () => {
    const stream = new MemoryWriteStream();
    const writer = new TestWriter(stream, options(), {
      code: (w) => {
        w.out("type A = ");
        w.renderType(new GraphQLList(GraphQLString));
        w.out("\n");
        w.out("type B = ");
        w.renderType(new GraphQLList(new GraphQLNonNull(GraphQLInt)));
        w.out("\n");
        w.out("type C = ");
        w.renderType(TestUnion);
        w.out("\n");
        w.out("type D = ");
        w.renderType(TestNode, (_type: any, field: any) => field.name === "id");
        w.out("\n");
        w.out("type E = ");
        w.renderGqlType(new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TestUnion))));
        w.out("\n");
      },
    });

    writer.write();
    const text = stream.toString();
    expect(text).toContain("type A = ReadonlyArray<string | undefined>");
    expect(text).toContain("type B = ReadonlyArray<number>");
    expect(text).toContain("type C = TestNode");
    expect(text).toContain("readonly id: string");
    expect(text).toContain("type E = [TestNode!]!");

    expect(() => writer.addImport("import { x } from 'x';")).toThrow(
      "Cannot import after write phase has started",
    );
    expect(() => writer.addType(TestInput)).toThrow(
      "Cannot import after write phase has started",
    );
    expect(() => writer.leaveScope()).toThrow("No scope to leave");
    expect(() =>
      new TestWriter(new MemoryWriteStream(), options(), {
        code: (w) => {
          w.renderType(new GraphQLScalarType({ name: "UnknownScalar" }));
        },
      }).write(),
    ).toThrow("Unknown scalar type UnknownScalar");
  });

  it("maps configured scalars to UserScalarTypes.<ScalarName>", () => {
    const stream = new MemoryWriteStream();
    const writer = new TestWriter(
      stream,
      options({
        scalarTypeMap: {
          JSON: "Record<string, unknown>",
        },
      }),
      {
        prepare: (w) => {
          w.addType(new GraphQLScalarType({ name: "JSON" }));
        },
        code: (w) => {
          w.out("type J = ");
          w.renderType(new GraphQLScalarType({ name: "JSON" }));
          w.out(";\n");
        },
      },
    );

    writer.write();
    const text = stream.toString();
    expect(text).toContain("import type { UserScalarTypes } from '../scalar-types';");
    expect(text).toContain("type J = UserScalarTypes.JSON;");
  });
});
