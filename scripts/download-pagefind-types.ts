/**
 * Downloads the Pagefind web-client type stubs from the upstream repo and
 * installs a module so that `import("/pagefind/pagefind.js")` is fully typed.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

const packageJsonPath = resolve(import.meta.dirname, "../node_modules/pagefind/package.json");
const version = JSON.parse(readFileSync(packageJsonPath, "utf-8")).version as string;

const TYPES_URL = new URL(
  `https://raw.githubusercontent.com/Pagefind/pagefind/v${version}/pagefind_web_js/types/index.d.ts`,
);

const OUT = resolve(import.meta.dirname, "../node_modules/pagefind-js/");

mkdirSync(OUT, { recursive: true });

let response: Response;
try {
  response = await fetch(TYPES_URL);
} catch (cause) {
  throw new Error(`Failed to fetch Pagefind types from ${TYPES_URL}`, {
    cause,
  });
}

if (!response.ok) {
  throw new Error(`Fetching Pagefind types failed: ${response.status} ${response.statusText}`);
}

const TYPES = await response.text();

await writeFile(resolve(OUT, "index.d.ts"), TYPES, "utf-8");
