/**
 * 枚举/输入类型元数据
 *
 * 用于 GraphQL query 序列化时区分 enum 和 input object 类型：
 * - enum 值直接输出（不加引号）：`status: ACTIVE`
 * - input object 递归展开字段：`input: { name: "foo" }`
 * - 普通字符串加引号输出：`name: "foo"`
 */

/** 枚举/输入类型元数据表，按类型名索引 */
export type EnumInputMetadata = ReadonlyMap<string, EnumInputMetaType>;

/** 单个枚举或输入类型的元信息 */
export interface EnumInputMetaType {
  /** 区分枚举还是输入类型 */
  readonly type: "ENUM" | "INPUT";
  /** GraphQL 类型名 */
  readonly name: string;
  /** INPUT 类型的字段映射（ENUM 没有字段，为 undefined） */
  readonly fields?: ReadonlyMap<string, EnumInputMetaType | undefined>;
  /** INPUT 字段的 GraphQL 类型名（保留 []/!） */
  readonly fieldGraphQLTypeMap?: ReadonlyMap<string, string>;
}

/** 构建器输入：输入类型的字段描述 */
export interface RawField {
  readonly name: string;
  readonly typeName: string;
  readonly graphqlTypeName?: string;
  readonly isLeaf?: boolean;
}

/**
 * 元数据构建器
 *
 * codegen 生成的代码会调用此构建器来注册 schema 中的 enum/input 类型：
 * ```ts
 * const builder = new EnumInputMetadataBuilder();
 * builder.add("Status");                           // enum
 * builder.add("CreateInput", [{name: "status", typeName: "Status"}]); // input
 * export const ENUM_INPUT_METADATA = builder.build();
 * ```
 */
export class EnumInputMetadataBuilder {
  private typeMap = new Map<string, ReadonlyArray<RawField> | undefined>();
  private static readonly BUILTIN_SCALARS = new Set([
    "ID",
    "String",
    "Int",
    "Float",
    "Boolean",
  ]);

  /** 注册一个枚举/输入类型。无 fields 参数表示 ENUM，有则表示 INPUT */
  add(name: string, fields?: ReadonlyArray<RawField>): this {
    this.typeMap.set(name, fields);
    return this;
  }

  /** 构建不可变的元数据表 */
  build(): EnumInputMetadata {
    const result = new Map<string, EnumInputMetaType>();
    const resolve = (name: string): EnumInputMetaType => {
      const existing = result.get(name);
      if (existing) return existing;

      if (!this.typeMap.has(name)) {
        throw new Error(`Unknown enum/input type: '${name}'`);
      }

      const rawFields = this.typeMap.get(name);
      let fields: Map<string, EnumInputMetaType | undefined> | undefined;
      let fieldGraphQLTypeMap: Map<string, string> | undefined;
      if (rawFields) {
        fields = new Map();
        fieldGraphQLTypeMap = new Map();
        for (const { name: fieldName, typeName, graphqlTypeName, isLeaf } of rawFields) {
          let resolved: EnumInputMetaType | undefined;
          const treatAsLeaf =
            isLeaf || EnumInputMetadataBuilder.BUILTIN_SCALARS.has(typeName);
          if (!treatAsLeaf) {
            if (!this.typeMap.has(typeName)) {
              throw new Error(`Unknown enum/input type: '${typeName}'`);
            }
            resolved = resolve(typeName);
          }
          fields.set(fieldName, resolved);
          if (graphqlTypeName) {
            fieldGraphQLTypeMap.set(fieldName, graphqlTypeName);
          }
        }
      }

      const metaType: EnumInputMetaType = {
        type: rawFields === undefined ? "ENUM" : "INPUT",
        name,
        fields,
        fieldGraphQLTypeMap,
      };
      result.set(name, metaType);
      return metaType;
    };

    for (const name of this.typeMap.keys()) {
      resolve(name);
    }
    return result;
  }
}
