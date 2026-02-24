/**
 * Generates shared TypeScript types used across all selections:
 * - `ImplementationType<T>`: recursive type mapping for type hierarchies
 * - `upcastTypes()` / `downcastTypes()`: runtime cast helpers
 * - `WithTypeName<T>`: utility type for __typename augmentation
 */

import { WriteStream } from "fs";
import { GraphQLSchema, GraphQLUnionType } from "graphql";
import { CodegenOptions } from "../options";
import { TypeHierarchyGraph } from "../type-hierarchy-graph";
import { isExcludedTypeName } from "../utils";
import { Writer } from "../writer";

export class CommonTypesWriter extends Writer {
  constructor(
    _schema: GraphQLSchema,
    private readonly typeHierarchy: TypeHierarchyGraph,
    stream: WriteStream,
    options: CodegenOptions,
  ) {
    super(stream, options);
  }

  protected writeCode() {
    this.writeImplementationType();
    this.writeCastMethod("up");
    this.writeCastMethod("down");
    this.writeWithTypeNameType();
  }

  private writeWithTypeNameType() {
    this.text(WITH_TYPE_NAME_DECLARATION);
    this.text("\n");
  }

  private writeImplementationType() {
    const t = this.text.bind(this);
    const entries = [...this.typeHierarchy.downcastTypeMap.entries()];

    t(IMPLEMENTATION_TYPE_COMMENT);
    t("export type ImplementationType<T> = ");
    this.enter("blank", true);
    for (const [type, castTypes] of entries) {
      if (isExcludedTypeName(this.options, type.name)) continue;
      t(`T extends '${type.name}' ? `);
      this.enter("blank");
      if (!(type instanceof GraphQLUnionType)) {
        t(`'${type.name}'`);
      }
      for (const castType of castTypes) {
        if (isExcludedTypeName(this.options, castType.name)) continue;
        this.separator(" | ");
        t(`ImplementationType<'${castType.name}'>`);
      }
      this.leave();
      t(" :\n");
    }
    t("T\n");
    this.leave();
    t(";");
  }

  private writeCastMethod(prefix: "up" | "down") {
    const t = this.text.bind(this);
    const castTypeMap =
      prefix === "up"
        ? this.typeHierarchy.upcastTypeMap
        : this.typeHierarchy.downcastTypeMap;
    const entries = [...castTypeMap.entries()];

    t(prefix === "up" ? UPCAST_FUNC_COMMENT : DOWNCAST_FUNC_COMMENT);

    t(`\nexport function ${prefix}castTypes(typeName: string): string[] `);
    this.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
      t("const typeNames: string[] = [];\n");
      t(`${prefix}castTypes0(typeName, typeNames);\n`);
      t("return typeNames;\n");
    });

    t(`\nfunction ${prefix}castTypes0(typeName: string, output: string[]) `);
    this.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
      t("switch (typeName)");
      this.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
        for (const [type, castTypes] of entries) {
          if (isExcludedTypeName(this.options, type.name)) continue;
          t(`case '${type.name}':`);
          this.scope({ type: "blank", multiLines: true }, () => {
            if (!(type instanceof GraphQLUnionType)) {
              t(`output.push('${type.name}');\n`);
            }
            for (const castType of castTypes) {
              if (isExcludedTypeName(this.options, castType.name)) continue;
              t(`${prefix}castTypes0('${castType.name}', output);\n`);
            }
            t("break;\n");
          });
        }
        t("default:");
        this.scope({ type: "blank", multiLines: true }, () => {
          t(`output.push(typeName);\n`);
          t("break;\n");
        });
      });
    });
  }
}

const IMPLEMENTATION_TYPE_COMMENT = `
/**
 * This 'ImplementationType' is used for type hierarchy resolution.
 */
`;

const UPCAST_FUNC_COMMENT = `
/**
 * This 'upcastTypes' resolves parent types in the type hierarchy.
 */
`;

const DOWNCAST_FUNC_COMMENT = `
/**
 * This 'downcastTypes' resolves child types in the type hierarchy.
 */
`;

const WITH_TYPE_NAME_DECLARATION = `
export type WithTypeName<T, TypeName extends string> =
    T extends {readonly __typename: string} ?
    T :
    T & {readonly __typename: TypeName};
;
`;
