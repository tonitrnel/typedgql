import { WriteStream } from "fs";
import {
  GraphQLArgument,
  GraphQLField,
  GraphQLFieldMap,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import {
  targetTypeOf,
  instancePrefix,
  isExcludedTypeName,
  toKebabCase,
} from "../utils";
import { CodegenOptions } from "../options";
import { ImportingBehavior, Writer } from "../writer";
import { SelectionContext } from "../selection-context";

type FieldCategory = "SCALAR" | "CONNECTION" | "LIST" | "REFERENCE" | "ID";

export class SelectionWriter extends Writer {
  protected readonly selectionTypeName: string;

  protected readonly defaultSelectionProps: string[];

  readonly emptySelectionName: string | undefined;

  readonly defaultSelectionName: string | undefined;

  readonly fieldMap: GraphQLFieldMap<any, any>;

  protected fieldArgsMap: Map<string, GraphQLArgument[]>;

  protected fieldCategoryMap: Map<string, FieldCategory>;

  protected hasArgs: boolean;

  private _declaredFieldNames?: ReadonlySet<string>;

  constructor(
    protected modelType:
      | GraphQLObjectType
      | GraphQLInterfaceType
      | GraphQLUnionType,
    protected ctx: SelectionContext,
    stream: WriteStream,
    options: CodegenOptions,
  ) {
    super(stream, options);

    this.selectionTypeName = `${this.modelType.name}${options.selectionSuffix ?? "Selection"}`;

    this.fieldMap = this.resolveFieldMap(modelType, options);
    const analysis = this.analyzeFields(this.fieldMap, modelType, options);
    this.defaultSelectionProps = analysis.defaultSelectionProps;
    this.fieldArgsMap = analysis.fieldArgsMap;
    this.fieldCategoryMap = analysis.fieldCategoryMap;
    this.hasArgs = analysis.hasArgs;

    if (isOperationRootTypeName(this.modelType.name)) {
      const prefix = instancePrefix(this.modelType.name);
      this.emptySelectionName = `${prefix}$`;
      this.defaultSelectionName =
        this.defaultSelectionProps.length !== 0 ? `${prefix}$$` : undefined;
    } else {
      this.emptySelectionName = undefined;
      this.defaultSelectionName = undefined;
    }
  }

  private resolveFieldMap(
    modelType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    options: CodegenOptions,
  ): GraphQLFieldMap<any, any> {
    if (modelType instanceof GraphQLUnionType) {
      return this.sharedUnionFields(modelType);
    }
    if (options.excludedTypes === undefined) {
      return modelType.getFields();
    }
    const filteredFieldMap: GraphQLFieldMap<any, any> = {};
    for (const [fieldName, field] of Object.entries(modelType.getFields())) {
      const targetTypeName = targetTypeOf(field.type)?.name;
      if (!isExcludedTypeName(options, targetTypeName)) {
        filteredFieldMap[fieldName] = field;
      }
    }
    return filteredFieldMap;
  }

  private sharedUnionFields(
    unionType: GraphQLUnionType,
  ): GraphQLFieldMap<any, any> {
    const memberTypes = unionType.getTypes();
    const memberCount = memberTypes.length;
    if (memberCount === 0) return {};

    const fieldCounts = new Map<string, number>();
    for (const type of memberTypes) {
      for (const fieldName of Object.keys(type.getFields())) {
        fieldCounts.set(fieldName, (fieldCounts.get(fieldName) ?? 0) + 1);
      }
    }

    const shared: GraphQLFieldMap<any, any> = {};
    for (const [fieldName, field] of Object.entries(memberTypes[0]!.getFields())) {
      if (fieldCounts.get(fieldName) === memberCount) {
        shared[fieldName] = field;
      }
    }
    return shared;
  }

  private analyzeFields(
    fieldMap: GraphQLFieldMap<any, any>,
    modelType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    options: CodegenOptions,
  ): {
    defaultSelectionProps: string[];
    fieldArgsMap: Map<string, GraphQLArgument[]>;
    fieldCategoryMap: Map<string, FieldCategory>;
    hasArgs: boolean;
  } {
    const defaultSelectionProps: string[] = [];
    const fieldArgsMap = new Map<string, GraphQLArgument[]>();
    const fieldCategoryMap = new Map<string, FieldCategory>();
    let hasArgs = false;

    for (const [fieldName, field] of Object.entries(fieldMap)) {
      if (this.isDefaultSelectionField(fieldName, field, modelType, options)) {
        defaultSelectionProps.push(fieldName);
      }
      if (field.args.length !== 0) {
        hasArgs = true;
        fieldArgsMap.set(fieldName, [...field.args]);
      }

      const category = this.fieldCategory(field);
      if (category !== undefined) {
        fieldCategoryMap.set(fieldName, category);
      }
    }

    return { defaultSelectionProps, fieldArgsMap, fieldCategoryMap, hasArgs };
  }

  private isDefaultSelectionField(
    fieldName: string,
    field: GraphQLField<unknown, unknown>,
    modelType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    options: CodegenOptions,
  ): boolean {
    if (isOperationRootTypeName(this.modelType.name)) return false;
    if (targetTypeOf(field.type) !== undefined) return false;
    if (field.args.length !== 0) return false;
    if (field.deprecationReason) return false;

    const excludes = options.defaultSelectionExcludeMap?.[modelType.name];
    return !excludes?.includes(fieldName);
  }

  private fieldCategory(field: GraphQLField<unknown, unknown>): FieldCategory | undefined {
    const fieldCoreType =
      field.type instanceof GraphQLNonNull ? field.type.ofType : field.type;
    if (this.ctx.embeddedTypes.has(fieldCoreType)) return "SCALAR";
    if (this.ctx.connections.has(fieldCoreType)) return "CONNECTION";

    if (fieldCoreType instanceof GraphQLList) {
      const elementType =
        fieldCoreType.ofType instanceof GraphQLNonNull
          ? fieldCoreType.ofType.ofType
          : fieldCoreType.ofType;
      if (
        elementType instanceof GraphQLObjectType ||
        elementType instanceof GraphQLInterfaceType ||
        elementType instanceof GraphQLUnionType
      ) {
        return "LIST";
      }
      return undefined;
    }

    if (
      fieldCoreType instanceof GraphQLObjectType ||
      fieldCoreType instanceof GraphQLInterfaceType ||
      fieldCoreType instanceof GraphQLUnionType
    ) {
      return "REFERENCE";
    }
    if (this.ctx.idFieldMap.get(this.modelType) === field) return "ID";
    return "SCALAR";
  }

  protected prepareImports() {
    if (this.hasArgs) {
      this.importStatement(
        "import type { AcceptableVariables, UnresolvedVariables, FieldOptions, DirectiveArgs } from '../../dist/index.mjs';",
      );
    } else {
      this.importStatement(
        "import type { FieldOptions, DirectiveArgs } from '../../dist/index.mjs';",
      );
    }
    this.importStatement(
      "import { ENUM_INPUT_METADATA } from '../enum-input-metadata';",
    );

    const importedSelectionTypeNames = new Set<string>();
    importedSelectionTypeNames.add(this.superSelectionTypeName(this.modelType));
    this.importStatement(
      `import type { ${Array.from(importedSelectionTypeNames).join(", ")} } from '../../dist/index.mjs';`,
    );
    this.importStatement(
      `import { createSelection, createSchemaType, registerSchemaTypeFactory, resolveRegisteredSchemaType } from '../../dist/index.mjs';`,
    );
    if (!isOperationRootTypeName(this.modelType.name)) {
      this.importStatement(
        "import type { WithTypeName, ImplementationType } from '../type-hierarchy';",
      );
    }
    for (const field of Object.values(this.fieldMap)) {
      this.importFieldTypes(field);
    }

    const importedConcreteSelectionNames = new Set<string>();
    const importedConcreteSelectionModules = new Set<string>();
    for (const field of Object.values(this.fieldMap)) {
      const targetType = targetTypeOf(field.type);
      if (targetType === undefined || targetType === this.modelType) {
        continue;
      }
      const selectionTypeName = this.selectionTypeNameForType(targetType);
      const selectionModule = `./${toKebabCase(selectionTypeName)}`;
      if (importedConcreteSelectionNames.has(selectionTypeName)) {
        if (!importedConcreteSelectionModules.has(selectionModule)) {
          importedConcreteSelectionModules.add(selectionModule);
          this.importStatement(`import '${selectionModule}';`);
        }
        continue;
      }
      importedConcreteSelectionNames.add(selectionTypeName);
      this.importStatement(
        `import type { ${selectionTypeName} } from '${selectionModule}';`,
      );
      importedConcreteSelectionModules.add(selectionModule);
      this.importStatement(`import '${selectionModule}';`);
    }

    const upcastTypes = this.ctx.typeHierarchy.upcastTypeMap.get(
      this.modelType,
    );
    if (upcastTypes !== undefined) {
      for (const upcastType of upcastTypes) {
        const selectionTypeName = `${upcastType.name}${this.options.selectionSuffix ?? "Selection"}`;
        const importedNames = this.importedNamesForSuperType(upcastType);
        if (importedNames.length === 0) continue;
        this.importStatement(
          `import { ${importedNames.join(", ")} } from './${toKebabCase(selectionTypeName)}';`,
        );
      }
    }
  }

  protected importedNamesForSuperType(
    superType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ): string[] {
    if (isOperationRootTypeName(superType.name)) {
      return [`${instancePrefix(superType.name)}$`];
    }
    return [];
  }

  protected importingBehavior(type: GraphQLNamedType): ImportingBehavior {
    if (type === this.modelType) {
      return "self";
    }
    if (
      type instanceof GraphQLObjectType ||
      type instanceof GraphQLInterfaceType
    ) {
      return "same_dir";
    }
    return "other_dir";
  }

  protected writeCode() {
    const t = this.text.bind(this);
    t(COMMENT);
    t("export interface ");
    t(this.selectionTypeName);
    t(
      "<T extends object, TVariables extends object, TLastField extends string = never> extends ",
    );
    t(this.superSelectionTypeName(this.modelType));
    t("<'");
    t(this.modelType.name);
    t("', T, TVariables> ");

    this.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
      this.writeFragmentMethods();
      this.writeDirectiveBuiltins();
      this.write$omit();
      this.write$alias();
      this.writeTypeName();

      for (const field of Object.values(this.fieldMap)) {
        this.text("\n");
        this.writePositiveProp(field);
      }
    });

    this.writeInstances();
    this.writeArgsInterface();
  }

  protected writeFragmentMethods() {
    const t = this.text.bind(this);

    if (!isOperationRootTypeName(this.modelType.name)) {
      t(
        `\n$on<XName extends ImplementationType<'${this.modelType.name}'>, X extends object, XVariables extends object>`,
      );
      this.scope(
        {
          type: "parameters",
          multiLines: !(this.modelType instanceof GraphQLUnionType),
        },
        () => {
          t(
            `child: ${this.superSelectionTypeName(this.modelType)}<XName, X, XVariables>`,
          );
          if (!(this.modelType instanceof GraphQLUnionType)) {
            this.separator(", ");
            t(
              "fragmentName?: string // undefined: inline fragment; otherwise, real fragment",
            );
          }
        },
      );
      t(`: ${this.selectionTypeName}`);
      this.scope({ type: "generic", multiLines: true }, () => {
        t(`XName extends '${this.modelType.name}' ?\n`);
        t("T & X :\n");
        t(`WithTypeName<T, ImplementationType<'${this.modelType.name}'>> & `);
        this.scope(
          { type: "blank", multiLines: true, prefix: "(", suffix: ")" },
          () => {
            t("WithTypeName<X, ImplementationType<XName>>");
            this.separator(" | ");
            t(
              `{__typename: Exclude<ImplementationType<'${this.modelType.name}'>, ImplementationType<XName>>}`,
            );
          },
        );
        this.separator(", ");
        t("TVariables & XVariables");
      });
      t(";\n");
    }
  }

  private writeDirectiveBuiltins() {
    const t = this.text.bind(this);

    t("\n\n$directive(name: string, args?: DirectiveArgs): ");
    this.writeFieldAwareSelectionReturnType();
    t(";\n");

    t("\n$include(condition: unknown): ");
    this.writeFieldAwareSelectionReturnType();
    t(";\n");

    t("\n$skip(condition: unknown): ");
    this.writeFieldAwareSelectionReturnType();
    t(";\n");
  }

  private writeFieldAwareSelectionReturnType() {
    const t = this.text.bind(this);
    t(this.selectionTypeName);
    this.scope({ type: "generic", multiLines: true }, () => {
      t(
        "TLastField extends keyof T ? Omit<T, TLastField> & {readonly [key in TLastField]?: T[key]} : T",
      );
      this.separator(", ");
      t("TVariables");
      this.separator(", ");
      t("TLastField");
    });
  }

  private writeTypeName() {
    if (!isOperationRootTypeName(this.modelType.name)) {
      const t = this.text.bind(this);
      t("\n\n");
      t("readonly __typename: ");
      t(this.selectionTypeName);
      t("<T & {__typename: ImplementationType<'");
      t(this.modelType.name);
      t("'>}, TVariables>;\n");
    }
  }

  private writePositiveProp(field: GraphQLField<unknown, unknown>) {
    const targetType = targetTypeOf(field.type);
    if (targetType !== undefined) {
      // Association field: generate callback-style method signature
      this.writeAssociationProp(field, targetType);
    } else {
      // Scalar field: generate readonly property accessor + args overload
      this.writePositivePropImpl(field, "SIMPLEST");
      this.writePositivePropImpl(field, "WITH_ARGS");
    }
  }

  private writeAssociationProp(
    field: GraphQLField<unknown, unknown>,
    targetType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ) {
    if (field.args.length === 0) {
      this.writeAssociationPropImpl(field, targetType, false);
      return;
    }

    this.writeAssociationPropImpl(field, targetType, true);
    this.writeAssociationPropImpl(field, targetType, false);
  }

  private writeAssociationPropImpl(
    field: GraphQLField<unknown, unknown>,
    targetType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    withArgs: boolean,
  ) {
    const t = this.text.bind(this);
    const nonNull = field.type instanceof GraphQLNonNull;
    const isPlural =
      field.type instanceof GraphQLNonNull
        ? field.type.ofType instanceof GraphQLList
        : field.type instanceof GraphQLList;
    const childSelectionType = this.selectionTypeNameForType(targetType);

    t("\n");
    if (field.deprecationReason) {
      t("/**\n * @deprecated ");
      t(field.deprecationReason);
      t("\n */\n");
    }

    t(field.name);
    this.scope({ type: "generic", multiLines: true }, () => {
      if (withArgs) {
        t(
          `XArgs extends AcceptableVariables<${this.modelType.name}Args['${field.name}']>`,
        );
        this.separator(", ");
      }
      t("X extends object");
      this.separator(", ");
      t("XVariables extends object");
    });
    this.scope({ type: "parameters", multiLines: true }, () => {
      if (withArgs) {
        t("args: XArgs");
        this.separator(", ");
      }
      t("selection: ");
      this.scope({ type: "parameters", multiLines: false }, () => {
        t(`selection: ${childSelectionType}<{}, {}>`);
      });
      t(` => ${childSelectionType}<X, XVariables>`);
    });
    t(`: ${this.selectionTypeName}`);
    this.scope({ type: "generic", multiLines: true, suffix: ";\n" }, () => {
      t("T & {");
      if (!this.options.objectEditable) {
        t("readonly ");
      }
      t(`"${field.name}"`);
      if (!nonNull) {
        t("?");
      }
      t(": ");
      if (isPlural) {
        t("ReadonlyArray<X>");
      } else {
        t("X");
      }
      t("}");
      this.separator(", ");
      t("TVariables & XVariables");
      if (withArgs) {
        t(
          ` & UnresolvedVariables<XArgs, ${this.modelType.name}Args['${field.name}']>`,
        );
      } else if (field.args.length !== 0) {
        t(` & ${this.modelType.name}Args["${field.name}"]`);
      }
      this.separator(", ");
      t(`"${field.name}"`);
    });
  }

  private write$omit() {
    // Collect scalar field names (no args, not associations)
    const omittableFields: string[] = [];
    for (const [fieldName, field] of Object.entries(this.fieldMap)) {
      if (field.args.length === 0 && targetTypeOf(field.type) === undefined) {
        omittableFields.push(fieldName);
      }
    }
    if (omittableFields.length === 0) return;

    const t = this.text.bind(this);
    t("\n\n$omit<XOmit extends ");
    t(omittableFields.map((f) => `"${f}"`).join(" | "));
    t(">");
    this.scope({ type: "parameters", multiLines: false }, () => {
      t("...fields: XOmit[]");
    });
    t(": ");
    t(this.selectionTypeName);
    t("<Omit<T, XOmit>, TVariables>;\n");
  }

  private write$alias() {
    const scalarFields = this.getScalarFieldNames();
    if (scalarFields.length === 0) return;

    const t = this.text.bind(this);
    t("\n$alias<XAlias extends string>");
    t("(");
    t("alias: XAlias");
    t("): ");
    t(this.selectionTypeName);
    t(
      "<TLastField extends keyof T ? Omit<T, TLastField> & {readonly [key in XAlias]: T[TLastField]} : T, TVariables>;\n",
    );
  }

  private getScalarFieldNames(): string[] {
    const fields: string[] = [];
    for (const [fieldName, field] of Object.entries(this.fieldMap)) {
      if (field.args.length === 0 && targetTypeOf(field.type) === undefined) {
        fields.push(fieldName);
      }
    }
    return fields;
  }

  private writePositivePropImpl(
    field: GraphQLField<unknown, unknown>,
    mode: "SIMPLEST" | "WITH_ARGS",
  ) {
    const withArgs = mode === "WITH_ARGS";
    if (withArgs && field.args.length === 0) {
      return;
    }
    const targetType = targetTypeOf(field.type);
    const renderAsField = field.args.length === 0 && targetType === undefined;
    const nonNull = field.type instanceof GraphQLNonNull;
    const t = this.text.bind(this);

    t("\n");
    if (field.deprecationReason) {
      t("/**\n");
      t(" * @deprecated");
      t(" ");
      t(field.deprecationReason);
      t("\n */\n");
    }
    if (renderAsField) {
      t("readonly ");
      t(field.name);
    } else {
      t(field.name);
      if (withArgs || targetType !== undefined) {
        this.scope({ type: "generic", multiLines: true }, () => {
          if (withArgs) {
            this.separator(", ");
            t(
              `XArgs extends AcceptableVariables<${this.modelType.name}Args['${field.name}']>`,
            );
          }
          if (targetType !== undefined) {
            this.separator(", ");
            t("X extends object");
            this.separator(", ");
            t("XVariables extends object");
          }
        });
      }
      this.scope({ type: "parameters", multiLines: true }, () => {
        if (withArgs) {
          this.separator(", ");
          t("args: XArgs");
        }
        if (targetType !== undefined) {
          this.separator(", ");
          t("child: ");
          t(this.superSelectionTypeName(targetType));
          t("<'");
          t(targetType.name);
          t("', X, XVariables>");
        }
      });
    }

    t(": ");
    t(this.selectionTypeName);
    this.scope(
      { type: "generic", multiLines: !renderAsField, suffix: ";\n" },
      () => {
        t("T & ");
        this.writePositivePropChangedDataType(field, false, !nonNull);

        this.separator(", ");
        t("TVariables");
        if (targetType !== undefined) {
          t(" & XVariables");
        }
        if (field.args.length !== 0) {
          if (withArgs) {
            t(
              ` & UnresolvedVariables<XArgs, ${this.modelType.name}Args['${field.name}']>`,
            );
          } else {
            t(` & ${this.modelType.name}Args["${field.name}"]`);
          }
        }
        this.separator(", ");
        t(`"${field.name}"`);
      },
    );
  }

  private writePositivePropChangedDataType(
    field: GraphQLField<unknown, unknown>,
    withOptions: boolean,
    nullable: boolean,
  ) {
    const t = this.text.bind(this);
    t("{");
    if (!this.options.objectEditable) {
      t("readonly ");
    }
    if (withOptions) {
      t(`[key in XAlias]`);
    } else {
      t(`"${field.name}"`);
    }
    if (nullable) {
      t("?");
    }
    t(": ");
    this.typeRef(
      field.type,
      targetTypeOf(field.type) !== undefined ? "X" : undefined,
    );
    t("}");
  }

  private writeInstances() {
    const t = this.text.bind(this);
    t("\nregisterSchemaTypeFactory(");
    this.str(this.modelType.name);
    t(", () => ");
    this.writeSchemaTypeForModelType();
    t(");\n");

    const emptySelectionName = this.emptySelectionName;
    if (!emptySelectionName) {
      return;
    }

    const itemTypes =
      this.modelType instanceof GraphQLUnionType
        ? this.modelType.getTypes()
        : [];

    t("\nexport const ");
    t(emptySelectionName);
    t(": ");
    t(this.selectionTypeName);
    t("<{}, {}> = ");
    this.scope({ type: "blank", multiLines: true, suffix: ";\n" }, () => {
      t("createSelection");
      this.scope({ type: "parameters", multiLines: true }, () => {
        t(`resolveRegisteredSchemaType("${this.modelType.name}")!`);
        this.separator(", ");
        this.text("ENUM_INPUT_METADATA");
        this.separator(", ");
        if (itemTypes.length === 0) {
          t("undefined");
        } else {
          this.scope(
            { type: "array", multiLines: itemTypes.length >= 2 },
            () => {
              for (const itemType of itemTypes) {
                this.separator(", ");
                this.str(itemType.name);
              }
            },
          );
        }
      });
    });

    if (this.defaultSelectionName !== undefined) {
      t("\nexport const ");
      t(this.defaultSelectionName);
      t(" = ");
      this.enter("blank", true);
      t(emptySelectionName);
      this.enter("blank", true);
      for (const propName of this.defaultSelectionProps) {
        t(".");
        t(propName);
        t("\n");
      }
      this.leave();
      this.leave(";\n");
    }
  }

  private writeSchemaTypeForModelType() {
    const t = this.text.bind(this);
    t("createSchemaType");
    this.scope({ type: "parameters", multiLines: true }, () => {
      t(`"${this.modelType.name}"`);
      this.separator(", ");
      t(this.schemaTypeCategory(this.modelType));
      this.separator(", ");
      this.scope({ type: "array" }, () => {
        const upcastTypes = this.ctx.typeHierarchy.upcastTypeMap.get(this.modelType);
        if (upcastTypes !== undefined) {
          for (const upcastType of upcastTypes) {
            this.separator(", ");
            t(`resolveRegisteredSchemaType("${upcastType.name}")!`);
          }
        }
      });
      this.separator(", ");
      this.scope({ type: "array", multiLines: true }, () => {
        for (const fieldName of this.declaredFieldNames) {
          this.separator(", ");
          this.writeSchemaFieldDescriptor(this.fieldMap[fieldName]!);
        }
      });
    });
  }

  private writeSchemaFieldDescriptor(field: GraphQLField<unknown, unknown>) {
    const t = this.text.bind(this);
    const args = this.fieldArgsMap.get(field.name);
    const category = this.fieldCategoryMap.get(field.name);
    const targetType = targetTypeOf(field.type);
    if (
      args === undefined &&
      (category === undefined || category === "SCALAR") &&
      field.type instanceof GraphQLNonNull &&
      targetType === undefined
    ) {
      t(`"${field.name}"`);
      return;
    }

    this.scope({ type: "block", multiLines: true }, () => {
      t(`category: "${category ?? "SCALAR"}"`);
      this.separator(", ");
      t(`name: "${field.name}"`);
      if (args !== undefined) {
        this.separator(", ");
        t("argGraphQLTypeMap: ");
        this.scope(
          { type: "block", multiLines: args.length > 1 },
          () => {
            for (const arg of args) {
              this.separator(", ");
              t(arg.name);
              t(": '");
              this.gqlTypeRef(arg.type);
              t("'");
            }
          },
        );
      }
      if (targetType !== undefined) {
        this.separator(", ");
        const connection = this.ctx.connections.get(targetType);
        if (connection !== undefined) {
          t(`connectionTypeName: "${targetType.name}"`);
          this.separator(", ");
          t(`edgeTypeName: "${connection.edgeType.name}"`);
          this.separator(", ");
          t(`targetTypeName: "${connection.nodeType.name}"`);
        } else {
          t(`targetTypeName: "${targetType.name}"`);
        }
      }
      if (!(field.type instanceof GraphQLNonNull)) {
        this.separator(", ");
        t("undefinable: true");
      }
    });
  }

  private schemaTypeCategory(
    type: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ): '"EMBEDDED"' | '"CONNECTION"' | '"EDGE"' | '"OBJECT"' {
    if (this.ctx.embeddedTypes.has(type)) {
      return '"EMBEDDED"';
    }
    if (this.ctx.connections.has(type)) {
      return '"CONNECTION"';
    }
    if (this.ctx.edgeTypes.has(type)) {
      return '"EDGE"';
    }
    return '"OBJECT"';
  }

  private writeArgsInterface() {
    if (!this.hasArgs) {
      return;
    }

    const t = this.text.bind(this);
    t(`\nexport interface ${this.modelType.name}Args `);
    this.scope({ type: "block", multiLines: true, suffix: "\n" }, () => {
      for (const field of Object.values(this.fieldMap)) {
        if (field.args.length !== 0) {
          this.separator(", ");
          t(`\nreadonly ${field.name}: `);
          this.scope({ type: "block", multiLines: true }, () => {
            for (const arg of field.args) {
              this.separator(", ");
              t("readonly ");
              t(arg.name);
              if (!(arg.type instanceof GraphQLNonNull)) {
                t("?");
              }
              t(": ");
              this.typeRef(arg.type);
            }
          });
        }
      }
    });
  }

  protected get declaredFieldNames(): ReadonlySet<string> {
    let set = this._declaredFieldNames;
    if (set === undefined) {
      this._declaredFieldNames = set = this.getDeclaredFieldNames();
    }
    return set;
  }

  private getDeclaredFieldNames(): ReadonlySet<string> {
    const fields = new Set<string>();
    if (
      this.modelType instanceof GraphQLObjectType ||
      this.modelType instanceof GraphQLInterfaceType
    ) {
      for (const field of Object.values(this.fieldMap)) {
        fields.add(field.name);
      }
      this.removeSuperFieldNames(
        fields,
        this.ctx.typeHierarchy.upcastTypeMap.get(this.modelType),
      );
    } else if (this.modelType instanceof GraphQLUnionType) {
      for (const fieldName of Object.keys(this.fieldMap)) {
        fields.add(fieldName);
      }
    }
    return fields;
  }

  private removeSuperFieldNames(
    fields: Set<string>,
    superTypes?: Set<
      GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType
    >,
  ) {
    if (superTypes !== undefined) {
      for (const superType of superTypes) {
        if (
          superType instanceof GraphQLObjectType ||
          superType instanceof GraphQLInterfaceType
        ) {
          const superFieldMap = superType.getFields();
          for (const superFieldName in superFieldMap) {
            fields.delete(superFieldName);
          }
        }
        this.removeSuperFieldNames(
          fields,
          this.ctx.typeHierarchy.upcastTypeMap.get(superType),
        );
      }
    }
  }

  private superSelectionTypeName(
    graphQLType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ): string {
    if (this.ctx.connections.has(graphQLType)) {
      return "ConnectionSelection";
    }
    if (this.ctx.edgeTypes.has(graphQLType)) {
      return "EdgeSelection";
    }
    return "ObjectSelection";
  }

  private selectionTypeNameForType(
    graphQLType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  ): string {
    return `${graphQLType.name}${this.options.selectionSuffix ?? "Selection"}`;
  }
}

const isOperationRootTypeName = (name: string): boolean => {
  return name === "Query" || name === "Mutation" || name === "Subscription";
};

const COMMENT = `/*
 * Any instance of this interface is immutable,
 * all the properties and functions can only be used to create new instances,
 * they cannot modify the current instance.
 * 
 * So any instance of this interface is reuseable.
 */
`;
