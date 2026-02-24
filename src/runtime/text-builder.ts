export type ScopeType = "block" | "arguments" | "array";

export interface ScopeOptions {
  readonly type: ScopeType;
  readonly multiLines?: boolean;
  readonly separator?: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

const SCOPE_BRACKETS: Record<ScopeType, [open: string, close: string]> = {
  block: ["{", "}"],
  arguments: ["(", ")"],
  array: ["[", "]"],
};

const DEFAULT_SEPARATORS: Partial<Record<ScopeType, string>> = {
  arguments: ", ",
  array: ", ",
};

interface ScopeState {
  readonly type: ScopeType;
  readonly multiLines: boolean;
  readonly separator: string | undefined;
  dirty: boolean;
}

export class TextBuilder {
  private result = "";
  private atNewLine = false;
  private readonly scopes: ScopeState[] = [];

  constructor(private readonly indent: string = "\t") { }

  text(value: string): this {
    const scope = this.scopes.at(-1);
    if (value && scope && !scope.dirty) {
      if (scope.multiLines) this.lineBreak();
      scope.dirty = true;
    }
    let remaining = value;
    while (remaining) {
      this.flushIndent();
      const newlineIdx = remaining.indexOf("\n");
      if (newlineIdx !== -1) {
        this.result += remaining.substring(0, newlineIdx);
        this.lineBreak();
        remaining = remaining.substring(newlineIdx + 1);
      } else {
        this.result += remaining;
        remaining = "";
      }
    }
    return this;
  }

  scope(options: ScopeOptions, action: () => void): this {
    const { type, multiLines = false, separator, prefix, suffix } = options;
    const [open, close] = SCOPE_BRACKETS[type];

    if (prefix) this.text(prefix);
    this.text(open);

    this.scopes.push({
      type,
      multiLines,
      separator: separator ?? DEFAULT_SEPARATORS[type],
      dirty: false,
    });

    try {
      action();
    } finally {
      this.scopes.pop();
      if (multiLines && !this.atNewLine) this.lineBreak();
      this.text(close);
      if (suffix) this.text(suffix);
    }

    return this;
  }

  separator(value?: string): this {
    const scope = this.scopes.at(-1);
    if (!scope) throw new Error("No existing scope");
    if (scope.dirty) {
      const sep = value || scope.separator;
      if (sep) this.text(sep);
      if (scope.multiLines) this.lineBreak();
    }
    return this;
  }

  toString(): string {
    return this.result;
  }

  private flushIndent(): void {
    if (this.atNewLine) {
      this.result += this.indent.repeat(this.scopes.length);
      this.atNewLine = false;
    }
  }

  private lineBreak(): void {
    this.result += "\n";
    this.atNewLine = true;
  }
}
