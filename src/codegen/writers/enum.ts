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
    const hasValueDocs = values.some(
      (v) => v.description?.trim() || v.deprecationReason?.trim(),
    );

    this.writeJsDoc(
      this.enumType.description?.trim(),
      this.enumType.astNode?.directives?.some((d) => d.name.value === "deprecated")
        ? "Deprecated enum type"
        : undefined,
    );

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
            this.writeJsDoc(value.description?.trim(), value.deprecationReason?.trim());
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
          multiLines: values.length > 3 || hasValueDocs,
        },
        () => {
          for (const value of values) {
            this.separator(" | ");
            this.writeJsDoc(value.description?.trim(), value.deprecationReason?.trim());
            t("'");
            t(value.name);
            t("'");
          }
        },
      );
    }
  }

  private writeJsDoc(description?: string, deprecationReason?: string) {
    if (!description && !deprecationReason) {
      return;
    }

    const t = this.text.bind(this);
    t("/**\n");
    if (description) {
      for (const line of this.escapeJsDoc(description).split("\n")) {
        t(" * ");
        t(line);
        t("\n");
      }
    }
    if (deprecationReason) {
      t(" * @deprecated ");
      t(this.escapeJsDoc(deprecationReason));
      t("\n");
    }
    t(" */\n");
  }

  private escapeJsDoc(value: string): string {
    return value.replaceAll("*/", "*\\/");
  }
}
