import { WriteStream } from "fs";
import {
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLNamedType,
  GraphQLNonNull,
} from "graphql";
import { CodegenOptions } from "../options";
import { ImportingBehavior, Writer } from "../writer";

export class InputWriter extends Writer {
  constructor(
    private readonly inputType: GraphQLInputObjectType,
    stream: WriteStream,
    options: CodegenOptions,
  ) {
    super(stream, options);
  }

  protected prepareImports() {
    for (const field of Object.values(this.inputType.getFields())) {
      this.importType(field.type);
    }
  }

  protected importingBehavior(type: GraphQLNamedType): ImportingBehavior {
    if (type === this.inputType) {
      return "self";
    }
    if (type instanceof GraphQLInputObjectType) {
      return "same_dir";
    }
    return "other_dir";
  }

  protected writeCode() {
    this.text(COMMENT);
    this.text("export type ");
    this.text(this.inputType.name);
    this.text(" = ");
    const fieldMap = this.inputType.getFields();
    if (this.inputType.isOneOf) {
      this.writeOneOfType(fieldMap);
      return;
    }

    this.enter("block", true);
    for (const field of Object.values(fieldMap)) {
      this.writeRegularField(field);
    }
    this.leave("\n");
  }

  private writeOneOfType(fieldMap: Record<string, GraphQLInputField>) {
    const fieldNames = Object.keys(fieldMap) as string[];
    if (fieldNames.length === 0) {
      this.text("{}\n");
      return;
    }

    fieldNames.forEach((selectedFieldName, idx) => {
      const selectedField = fieldMap[selectedFieldName]!;
      if (idx > 0) this.text(" | ");
      this.enter("block", true);
      for (const fieldName of fieldNames) {
        if (!this.options.objectEditable) this.text("readonly ");
        const field = fieldMap[fieldName]!;
        this.text(field.name);
        if (fieldName === selectedFieldName) {
          this.text(": Exclude<");
          this.typeRef(selectedField.type);
          this.text(", undefined>;\n");
        } else {
          this.text("?: never;\n");
        }
      }
      this.leave();
    });
    this.text("\n");
  }

  private writeRegularField(field: GraphQLInputField): void {
    if (!this.options.objectEditable) this.text("readonly ");
    this.text(field.name);
    if (!(field.type instanceof GraphQLNonNull)) this.text("?");
    this.text(": ");
    this.typeRef(field.type);
    this.text(";\n");
  }
}

const COMMENT = `/*
 * This input type is not interface, because interfaces 
 * do not satisfy the constraint 'SerializableParam' of recoil
 */
`;
