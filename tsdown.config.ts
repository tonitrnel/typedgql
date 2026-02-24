import { defineConfig } from "tsdown";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rawPlugin = {
  name: "raw-ts",
  resolveId(id: string, importer?: string) {
    if (!id.endsWith("?raw")) return null;
    const base = resolve(
      importer ? dirname(importer) : __dirname,
      id.slice(0, -4),
    );
    return "\0raw:" + base;
  },
  load(id: string) {
    if (!id.startsWith("\0raw:")) return null;
    const content = readFileSync(id.slice(5), "utf-8");
    return `export default ${JSON.stringify(content)};`;
  },
};

export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts", "src/node.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "es2022",
  plugins: [rawPlugin],
});
