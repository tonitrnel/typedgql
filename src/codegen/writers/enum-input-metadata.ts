import { WriteStream } from "fs";
import {
  GraphQLEnumType,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLSchema,
} from "graphql";
import { CodegenOptions } from "../options";
import { Writer } from "../writer";

export class EnumInputMetadataWriter extends Writer {
  constructor(
    private readonly schema: GraphQLSchema,
    stream: WriteStream,
    options: CodegenOptions,
  ) {
    super(stream, options);
  }

  protected prepareImports() {
    this.importStatement(
      "import { EnumInputMetadataBuilder } from '../dist/index.mjs';",
    );
  }

  protected writeCode() {
    const processedTypeNames = new Set<string>();
    const enumInputMetaTypeMap = new Map<string, ReadonlyArray<GraphQLInputField> | undefined>();
    for (const type of Object.values(this.schema.getTypeMap())) {
      if (
        !(type instanceof GraphQLEnumType) &&
        !(type instanceof GraphQLInputObjectType)
      ) {
        continue;
      }
      this.collectEnumMetaTypes(type, processedTypeNames, enumInputMetaTypeMap);
    }

    this.text("const builder = new EnumInputMetadataBuilder();\n");
    for (const [typeName, fields] of enumInputMetaTypeMap) {
      this.text(`\nbuilder.add("${typeName}"`);
      if (fields !== undefined) {
        this.text(", ");
        this.scope({ type: "array", multiLines: true }, () => {
          for (const field of fields) {
            this.separator(", ");
            this.scope({ type: "block" }, () => {
              this.text(`name: "${field.name}", typeName: "${EnumInputMetadataWriter.inputTypeName(field.type)}"`);
            });
          }
        });
      }
      this.text(");\n");
    }
    this.text("\nexport const ENUM_INPUT_METADATA = builder.build();\n");
  }

  private collectEnumMetaTypes(
    type: GraphQLInputType,
    processedTypeNames: Set<string>,
    outMap: Map<string, ReadonlyArray<GraphQLInputField> | undefined>,
  ): boolean {
    if (type instanceof GraphQLScalarType) {
      return false;
    }
    if (type instanceof GraphQLList || type instanceof GraphQLNonNull) {
      return this.collectEnumMetaTypes(type.ofType, processedTypeNames, outMap);
    }

    if (type.name.startsWith("__")) {
      return false;
    }

    if (outMap.has(type.name)) {
      return true;
    }

    if (processedTypeNames.has(type.name)) {
      return false;
    }

    if (type instanceof GraphQLEnumType) {
      outMap.set(type.name, undefined);
      return true;
    }

    processedTypeNames.add(type.name);
    const fieldMap = type.getFields();
    const fields: GraphQLInputField[] = [];
    for (const field of Object.values(fieldMap)) {
      if (this.collectEnumMetaTypes(field.type, processedTypeNames, outMap)) {
        fields.push(field);
      }
    }
    if (fields.length === 0) {
      return false;
    }
    outMap.set(type.name, fields);
    return true;
  }

  private static inputTypeName(type: GraphQLInputType): string {
    if (type instanceof GraphQLList) {
      return EnumInputMetadataWriter.inputTypeName(type.ofType);
    }
    if (type instanceof GraphQLNonNull) {
      return EnumInputMetadataWriter.inputTypeName(type.ofType);
    }
    return (
      type as GraphQLEnumType | GraphQLInputObjectType | GraphQLScalarType
    ).name;
  }
}
