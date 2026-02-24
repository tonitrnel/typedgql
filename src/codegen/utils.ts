import {
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import { CodegenOptions } from "./options";

/**
 * Unwrap NonNull/List wrappers and return the underlying composite type,
 * or `undefined` if the base type is a scalar/enum/input.
 */
export function targetTypeOf(
  type: GraphQLType,
): GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType | undefined {
  if (type instanceof GraphQLNonNull) {
    return targetTypeOf(type.ofType);
  }
  if (type instanceof GraphQLList) {
    return targetTypeOf(type.ofType);
  }
  if (
    type instanceof GraphQLObjectType ||
    type instanceof GraphQLInterfaceType ||
    type instanceof GraphQLUnionType
  ) {
    return type;
  }
  return undefined;
}

/**
 * Lower-case the first character of a name for use as a variable/instance prefix.
 * e.g. "QuerySelection" → "querySelection"
 */
export function instancePrefix(name: string): string {
  return name.substring(0, 1).toLowerCase() + name.substring(1);
}

/**
 * Check whether a type name is in the user's exclusion list.
 */
export function isExcludedTypeName(
  options: CodegenOptions,
  typeName: string | undefined,
) {
  if (typeName == undefined) {
    return false;
  }
  const list = options.excludedTypes;
  return list !== undefined && list.findIndex((v) => v == typeName) !== -1;
}

/**
 * Convert a PascalCase or camelCase name to kebab-case.
 * e.g. "TaskSelection" → "task-selection", "EnumInputMetadata" → "enum-input-metadata"
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase();
}
