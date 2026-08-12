import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const outputRoot = path.join(projectRoot, "public", "pdfjs");
const assetDirectories = ["cmaps", "standard_fonts", "wasm"];

mkdirSync(outputRoot, { recursive: true });

for (const directory of assetDirectories) {
  const source = path.join(pdfjsRoot, directory);
  const destination = path.join(outputRoot, directory);

  if (!existsSync(source)) {
    throw new Error(`Missing PDF.js asset directory: ${source}`);
  }

  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

console.log(`Synced PDF.js browser assets to ${path.relative(projectRoot, outputRoot)}`);
