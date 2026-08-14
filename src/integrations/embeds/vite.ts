import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

/**
 * Mastodon's `GlobalStyles.css` is imported as `?url` by its component (for
 * shadow-DOM use), so importing the package root does not ship it as page
 * CSS; the styles virtual module imports the file directly instead.
 */
const MASTODON_GLOBAL_STYLES = join(
  dirname(fileURLToPath(import.meta.resolve("@astro-community/astro-embed-mastodon"))),
  "src/GlobalStyles.css",
);

/**
 * The lite custom elements are defined by scripts inside the YouTube and
 * Vimeo components: an external `lite-youtube-embed` import and an inline
 * `LiteVimeo` class. Both are re-imported through the components' compiled
 * script modules, which Vite resolves from the package directories (the
 * YouTube one pulls in the transitive `lite-youtube-embed` dependency).
 */
const YOUTUBE_SCRIPT = join(
  dirname(fileURLToPath(import.meta.resolve("@astro-community/astro-embed-youtube"))),
  "YouTube.astro?astro&type=script&index=0&lang.ts",
);
const VIMEO_SCRIPT = join(
  dirname(fileURLToPath(import.meta.resolve("@astro-community/astro-embed-vimeo"))),
  "Vimeo.astro?astro&type=script&index=0&lang.ts",
);

const EMBED_PACKAGES = [
  "@astro-community/astro-embed-bluesky",
  "@astro-community/astro-embed-gist",
  "@astro-community/astro-embed-link-preview",
  "@astro-community/astro-embed-mastodon",
  "@astro-community/astro-embed-twitter",
  "@astro-community/astro-embed-vimeo",
  "@astro-community/astro-embed-youtube",
] as const;

/**
 * The embed components' styles are stripped from the container-rendered
 * output, so the integration ships them build-wide instead. Importing each
 * package root brings its CSS transitively (the components import their own
 * stylesheets), and Astro's transform injects the scoped `.astro` styles.
 * Every page carries the (small, cached) stylesheet chunk even when it has no
 * embeds — this is the price of keeping documents and pages unaware that
 * embeds exist.
 */
const STYLES_MODULE = [
  ...EMBED_PACKAGES.map((spec) => `import ${JSON.stringify(spec)};`),
  `import ${JSON.stringify(MASTODON_GLOBAL_STYLES)};`,
].join("\n");

const LITE_YOUTUBE_SCRIPT = "\0virtual:embeds/lite-youtube";
const LITE_VIMEO_SCRIPT = "\0virtual:embeds/lite-vimeo";

/**
 * The loader must not dynamic-import the compiled script module ids directly.
 * The components are in the SSR graph for their styles, so the analyzer
 * registers their script modules as client-build entries; `@astro/plugin-scripts`
 * then inlines small self-contained entry chunks and deletes them from the
 * bundle. The inlined code only reaches HTML via `renderScript` when the
 * component is page-rendered — embeds are container-rendered at sync time, so
 * the code would land nowhere and the loader's dynamic imports would dangle.
 * Each wrapper here statically imports one script module, so the entry chunk
 * appears in the bundle's `importedIds` and the inliner skips it.
 */
const SCRIPTS_MODULE = `
{
  if (document.querySelector("lite-youtube")) import("virtual:embeds/lite-youtube");
  if (document.querySelector("lite-vimeo")) import("virtual:embeds/lite-vimeo");
}
`;

const VIRTUAL_STYLES = "\0virtual:embeds/styles";
const VIRTUAL_SCRIPTS = "\0virtual:embeds/scripts";

export function embedVitePlugin(options: {
  contentConfigPath?: string;
}): Plugin {
  const { contentConfigPath } = options;
  return {
    name: "embeds:registry",
    resolveId(id: string) {
      if (id === "virtual:embeds/registry") return VIRTUAL_REGISTRY;
      if (id === "virtual:embeds/styles") return VIRTUAL_STYLES;
      if (id === "virtual:embeds/scripts") return VIRTUAL_SCRIPTS;
      if (id === "virtual:embeds/lite-youtube") return LITE_YOUTUBE_SCRIPT;
      if (id === "virtual:embeds/lite-vimeo") return LITE_VIMEO_SCRIPT;
    },
    load(id: string) {
      if (id === VIRTUAL_REGISTRY) {
        return `import ${JSON.stringify(componentsPath)};`;
      }
      if (id === VIRTUAL_STYLES) return STYLES_MODULE;
      if (id === VIRTUAL_SCRIPTS) return SCRIPTS_MODULE;
      if (id === LITE_YOUTUBE_SCRIPT) {
        return `import ${JSON.stringify(YOUTUBE_SCRIPT)};`;
      }
      if (id === LITE_VIMEO_SCRIPT) {
        return `import ${JSON.stringify(VIMEO_SCRIPT)};`;
      }
    },
    transform(code: string, id: string) {
      if (contentConfigPath === undefined) return;
      if (id.split("?")[0] !== contentConfigPath) return;
      return `import "virtual:embeds/registry";\n${code}`;
    },
  };
}
