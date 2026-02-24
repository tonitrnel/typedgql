/**
 * 为 selection 中的字段提供参数（args）、别名（alias）和指令（directive）配置。
 * 通过链式调用构建，每次调用返回一个新的不可变节点。
 */

import { DirectiveArgs } from "./types";
import { UnresolvedVariables } from "./parameter";

export interface FieldOptionsValue {
  readonly alias?: string;
  readonly directives: ReadonlyMap<string, DirectiveArgs>;
}

export class FieldOptions<
  TAlias extends string,
  TDirectives extends { readonly [key: string]: DirectiveArgs },
  TDirectiveVariables extends object,
> {
  private _value?: FieldOptionsValue;

  constructor(
    private readonly _prev?: FieldOptions<string, any, any>,
    private readonly _alias?: string,
    private readonly _directive?: string,
    private readonly _directiveArgs?: object,
  ) { }

  alias<XAlias extends string>(
    alias: XAlias,
  ): FieldOptions<XAlias, TDirectives, TDirectiveVariables> {
    return new FieldOptions<XAlias, TDirectives, TDirectiveVariables>(this, alias);
  }

  directive<XDirective extends string, XArgs extends DirectiveArgs = {}>(
    directive: XDirective,
    args?: XArgs,
  ): FieldOptions<
    TAlias,
    TDirectives & { readonly [key in XDirective]: XArgs },
    TDirectiveVariables & UnresolvedVariables<XArgs, Record<keyof XArgs, any>>
  > {
    if (directive.startsWith("@")) {
      throw new Error("directive name should not start with '@', it will be prepended automatically");
    }
    return new FieldOptions<
      TAlias,
      TDirectives & { readonly [key in XDirective]: XArgs },
      TDirectiveVariables & UnresolvedVariables<XArgs, XArgs>
    >(this, undefined, directive, args);
  }

  get value(): FieldOptionsValue {
    return (this._value ??= this._buildValue());
  }

  private _buildValue(): FieldOptionsValue {
    let alias: string | undefined;
    const directives = new Map<string, DirectiveArgs>();

    for (let node: FieldOptions<string, any, any> | undefined = this; node; node = node._prev) {
      if (node._alias !== undefined && alias === undefined) {
        alias = node._alias;
      }
      if (node._directive !== undefined && !directives.has(node._directive)) {
        const args = node._directiveArgs;
        directives.set(
          node._directive,
          args && Object.keys(args).length !== 0 ? args : undefined,
        );
      }
    }

    return { alias, directives };
  }

  " $supressWarnings"(
    _alias: TAlias,
    _directives: TDirectives,
    _directiveVariables: TDirectiveVariables,
  ): void {
    throw new Error('" $supressWarnings" is unsupported');
  }
}

export function createFieldOptions<TAlias extends string>(): FieldOptions<
  TAlias, {}, {}
> {
  return new FieldOptions<TAlias, {}, {}>();
}
