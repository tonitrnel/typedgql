import { WriteStream } from "fs";
import { GraphQLEnumType } from "graphql";
import { CodegenOptions } from "../options";
import { Writer } from "../writer";

export class EnumWriter extends Writer {
  constructor(
    private readonly enumType: GraphQLEnumType,
    stream: WriteStream,
    options: CodegenOptions,
  ) {
    super(stream, options);
  }

  protected writeCode() {
    const t = this.text.bind(this);
    const values = this.enumType.getValues();

    if (
      this.options.tsEnum === true ||
      this.options.tsEnum === "number" ||
      this.options.tsEnum === "string"
    ) {
      t("export enum ");
      t(this.enumType.name);
      this.scope(
        {
          type: "block",
          prefix: " ",
          suffix: "\n",
          multiLines: values.length > 3,
        },
        () => {
          for (const value of values) {
            this.separator(", ");
            if (this.options.tsEnum === "string") {
              t(value.name);
              t(" = ");
              t("'");
              t(value.name);
              t("'");
            } else {
              t(value.name);
            }
          }
        },
      );
    } else {
      t("export type ");
      t(this.enumType.name);
      t(" = ");

      this.scope(
        {
          type: "blank",
          suffix: ";\n",
          multiLines: values.length > 3,
        },
        () => {
          for (const value of values) {
            this.separator(" | ");
            t("'");
            t(value.name);
            t("'");
          }
        },
      );
    }
  }
}
