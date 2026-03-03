import { readdir, readFile, stat, writeFile } from "fs/promises";
import { dirname, join, relative } from "path";

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export async function rewriteGeneratedImportsToSrcEntry(
  generatedDir: string,
): Promise<void> {
  const srcIndex = join(process.cwd(), "src", "index");

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const fileStat = await stat(fullPath);
      if (fileStat.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!fullPath.endsWith(".ts")) continue;

      const rel = toPosixPath(relative(dirname(fullPath), srcIndex));
      const targetImport = rel.startsWith(".") ? rel : `./${rel}`;
      const src = await readFile(fullPath, "utf8");
      const next = src.replace(
        /(['"])(?:\.\.\/|\.\/)+dist\/index\.mjs\1/g,
        (_all, q: string) => `${q}${targetImport}${q}`,
      );
      if (next !== src) {
        await writeFile(fullPath, next, "utf8");
      }
    }
  }

  await walk(generatedDir);
}
