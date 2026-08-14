import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/**
 * Candidate locations of the build-time content config, in the same search
 * order Astro itself uses (`searchConfig`/`searchLegacyConfig` in
 * astro/src/content/utils).
 */
const CONTENT_CONFIG_NAMES = [
  "content.config.mjs",
  "content.config.js",
  "content.config.mts",
  "content.config.ts",
  "content/config.ts",
  "content/config.js",
  "content/config.mjs",
  "content/config.mts",
] as const;

export function findContentConfig(srcDir: string): string | undefined {
  return CONTENT_CONFIG_NAMES.map((name) => resolve(srcDir, name)).find(
    (path) => existsSync(path),
  );
}

/**
 * The embed registry must load through a Vite graph (`.astro` components need
 * Astro's transforms) and publish before the content layer renders markdown:
 * the loader renders entries at sync time and pages display that stored HTML,
 * so a request-time load (e.g. `page-ssr`) is too late. The only module
 * guaranteed to load through a Vite graph before sync in both dev and build
 * is the content config itself (the types generator imports it), so its
 * transform prepends an import of a stable virtual module that re-exports the
 * registry module. The virtual id decouples the transform from the registry's
 * source location.
 */
const componentsPath = fileURLToPath(new URL("./components.ts", import.meta.url));
const VIRTUAL_REGISTRY = "\0virtual:embeds/registry";

export function embedVitePlugin(options: {
  contentConfigPath?: string;
}): Plugin {
  const { contentConfigPath } = options;
  return {
    name: "embeds:registry",
    resolveId(id: string) {
      if (id === "virtual:embeds/registry") return VIRTUAL_REGISTRY;
    },
    load(id: string) {
      if (id === VIRTUAL_REGISTRY) {
        return `import ${JSON.stringify(componentsPath)};`;
      }
    },
    transform(code: string, id: string) {
      if (contentConfigPath === undefined) return;
      if (id.split("?")[0] !== contentConfigPath) return;
      return `import "virtual:embeds/registry";\n${code}`;
    },
  };
}
