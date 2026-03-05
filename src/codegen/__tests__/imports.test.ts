import { describe, expect, it } from "vitest";
import {
  CODEGEN_IMPORT_SOURCE_MAP,
  JSImportCollector,
} from "../imports";

describe("JSImportCollector", () => {
  it("deduplicates and sorts type/value/side-effect imports", () => {
    const out: string[] = [];
    const collector = new JSImportCollector(
      (stmt) => out.push(stmt),
      CODEGEN_IMPORT_SOURCE_MAP,
    );

    collector.useMapped("Selection");
    collector.useMapped("DirectiveArgs");
    collector.useMapped("Selection");
    collector.useMapped("createSchemaType");
    collector.useMapped("registerSchemaTypeFactory");
    collector.useMapped("createSchemaType");
    collector.useSideEffect("./user-selection");
    collector.useSideEffect("./user-selection");
    collector.useType("./x", "B");
    collector.useType("./x", "A");
    collector.useValue("./y", "q");
    collector.useValue("./y", "p");

    collector.emit();

    expect(out).toEqual([
      "import type { DirectiveArgs, Selection } from '../../dist/index.mjs';",
      "import type { A, B } from './x';",
      "import { createSchemaType, registerSchemaTypeFactory } from '../../dist/index.mjs';",
      "import { p, q } from './y';",
      "import './user-selection';",
    ]);
  });

  it("keeps unified import source map stable", () => {
    expect(CODEGEN_IMPORT_SOURCE_MAP.Selection.source).toBe("../../dist/index.mjs");
    expect(CODEGEN_IMPORT_SOURCE_MAP.Selection.kind).toBe("type");
    expect(CODEGEN_IMPORT_SOURCE_MAP.createSelection.source).toBe("../../dist/index.mjs");
    expect(CODEGEN_IMPORT_SOURCE_MAP.ENUM_INPUT_METADATA.source).toBe("../enum-input-metadata");
  });

  it("keeps enum-input-metadata writer import source map stable", () => {
    expect(
      CODEGEN_IMPORT_SOURCE_MAP.EnumInputMetadataBuilder.source,
    ).toBe("../dist/index.mjs");
    expect(
      CODEGEN_IMPORT_SOURCE_MAP.EnumInputMetadataBuilder.kind,
    ).toBe("value");
  });
});
