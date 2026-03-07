import ts from "typescript";

export interface ScalarTypeDeclarationAnalysis {
  readonly exportedNames: ReadonlySet<string>;
}

export function analyzeScalarTypeDeclarations(
  source: string | undefined,
): ScalarTypeDeclarationAnalysis {
  if (!source || source.trim().length === 0) {
    return { exportedNames: new Set<string>() };
  }

  const transpiled = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
    fileName: "scalar-types.ts",
  });
  const hasError = (transpiled.diagnostics ?? []).some(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (hasError) {
    throw new Error("scalarTypeDeclarations has TypeScript syntax errors");
  }

  const sf = ts.createSourceFile(
    "scalar-types.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const exportedNames = new Set<string>();
  for (let i = 0; i < sf.statements.length; i++) {
    const stmt = sf.statements[i]!;
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      const hasExport = stmt.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (hasExport) {
        const name = stmt.name.text;
        if (exportedNames.has(name)) {
          throw new Error(
            `scalarTypeDeclarations has duplicate export '${name}'`,
          );
        }
        exportedNames.add(name);
      }
      continue;
    }

    throw new Error(
      `scalarTypeDeclarations statement[${i}] must be type/interface declaration`,
    );
  }

  return { exportedNames };
}
