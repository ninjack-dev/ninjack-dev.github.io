import type { AstroIntegration } from "astro";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedPlugin } from "./plugin.ts";

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

/** The embed registry must load through a Vite graph (`.astro` components need
 * Astro's transforms) and publish before the content layer renders markdown:
 * the loader renders entries at sync time and pages display that stored HTML,
 * so a request-time load (e.g. `page-ssr`) is too late. The only module
 * guaranteed to load through a Vite graph before sync in both dev and build
 * is the content config itself (the types generator imports it), so its
 * transform prepends an import of the registry module. */
const EMBED_REGISTRY = fileURLToPath(new URL("./components.ts", import.meta.url));

/**
 * Package root for a direct dependency, resolved at config time.
 */
function packageDir(spec: string): string {
  return dirname(fileURLToPath(import.meta.resolve(spec)));
}

const YOUTUBE_DIR = packageDir("@astro-community/astro-embed-youtube");
const VIMEO_DIR = packageDir("@astro-community/astro-embed-vimeo");
const TWITTER_DIR = packageDir("@astro-community/astro-embed-twitter");
const MASTODON_DIR = packageDir("@astro-community/astro-embed-mastodon");
const BLUESKY_DIR = packageDir("@astro-community/astro-embed-bluesky");
const LINK_PREVIEW_DIR = packageDir("@astro-community/astro-embed-link-preview");

/**
 * `lite-youtube-embed` is a transitive dependency of the YouTube embed, so its
 * location depends on the package manager layout (pnpm's isolated `.pnpm/`
 * store vs. hoisted npm/yarn trees). Resolve it with Node's own module
 * resolution from the dependent instead of hardcoding layouts.
 */
const requireFromYouTube = createRequire(join(YOUTUBE_DIR, "package.json"));
const LITE_YOUTUBE_SCRIPT = requireFromYouTube.resolve("lite-youtube-embed");
const liteYoutubePkgPath = requireFromYouTube.resolve("lite-youtube-embed/package.json");
const liteYoutubePkg = JSON.parse(readFileSync(liteYoutubePkgPath, "utf8")) as { style?: string };
// Prefer the package-declared `style` entry over a hardcoded subpath: an
// internal file path stops resolving the moment the package adds an `exports`
// map that hides it, which would fail config load and take dev/build down
// with it. Falls back to the stylesheet sibling of the resolved main.
const LITE_YOUTUBE_CSS = liteYoutubePkg.style
  ? join(dirname(liteYoutubePkgPath), liteYoutubePkg.style)
  : join(dirname(LITE_YOUTUBE_SCRIPT), "lite-yt-embed.css");

/**
 * The embed components' styles and client scripts are stripped from the
 * container-rendered output, so the integration ships them build-wide instead:
 * styles via a `page-ssr` CSS import on every page, and the two lite
 * web-component scripts via a tiny conditional loader that only imports them
 * when the corresponding element is present. Injection happens here, in the
 * integration, so documents and pages stay unaware that embeds exist — this
 * is the price of that transparency: every page carries the (small, cached)
 * stylesheet chunk even when it has no embeds.
 */

/**
 * The `.astro` components' `<style>` blocks survive neither the container
 * render (partial rendering drops the head, and with it every collected
 * stylesheet) nor the plain-CSS list above (scoped rules like `.post-text`
 * live in virtual modules, not in the package CSS files). Ship them the same
 * way: import each style-bearing component's compiled style module
 * (`?astro&type=style&index=N&lang.css`). The astro Vite plugin only serves a
 * style module once the main `.astro` module has been compiled into the graph
 * (its compile-metadata map is filled by the transform), so each file is also
 * imported first; that import also keeps the component's default export alive
 * in the bundle, which is what Vite's `cssScopeTo` tree-shaking keys on.
 *
 * Packages are scanned rather than enumerated so a component the packages add
 * later is picked up automatically; `is:inline` styles (which compile to no
 * module) are excluded by counting only `<style` tags that are not inline.
 */
function astroStyleImports(...dirs: string[]): string {
  const imports: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    for (const file of readdirSync(dir, { recursive: true })) {
      if (typeof file !== "string" || !file.endsWith(".astro")) continue;
      const path = join(dir, file);
      if (seen.has(path)) continue;
      seen.add(path);
      const source = readFileSync(path, "utf8");
      const styleCount = (source.match(/<style(?![^>]*is:inline)/g) ?? []).length;
      if (styleCount === 0) continue;
      imports.push(`import ${JSON.stringify(path)};`);
      for (let index = 0; index < styleCount; index++) {
        imports.push(
          `import ${JSON.stringify(`${path}?astro&type=style&index=${index}&lang.css`)};`,
        );
      }
    }
  }
  return imports.join("\n");
}

const EMBED_STYLES = [
  ...[
    LITE_YOUTUBE_CSS,
    join(VIMEO_DIR, "Vimeo.css"),
    join(TWITTER_DIR, "Tweet.css"),
    join(MASTODON_DIR, "src/GlobalStyles.css"),
    join(BLUESKY_DIR, "styles.css"),
  ].map((path) => `import ${JSON.stringify(path)};`),
  astroStyleImports(BLUESKY_DIR, MASTODON_DIR, LINK_PREVIEW_DIR, YOUTUBE_DIR),
]
  .filter(Boolean)
  .join("\n");

/**
 * The `lite-vimeo` custom element is defined by an inline `<script>` inside
 * `Vimeo.astro` (no standalone JS file), so it is imported through the module
 * id Astro uses for hoisted scripts (`vite-plugin-astro/query.ts`). Unlike the
 * YouTube script above (resolved from the package main), this id is an Astro
 * internal that can change between versions; when it does, the loader's
 * dynamic import fails to resolve and the Vimeo script breaks (loudly at
 * build time, silently in dev). Re-verify this query on Astro upgrades.
 */
const VIMEO_SCRIPT = join(VIMEO_DIR, "Vimeo.astro?astro&type=script&index=0&lang.ts");

const LITE_SCRIPTS = `
{
  if (document.querySelector("lite-youtube")) import(${JSON.stringify(LITE_YOUTUBE_SCRIPT)});
  if (document.querySelector("lite-vimeo")) import(${JSON.stringify(VIMEO_SCRIPT)});
}
`;

export default function embeds(): AstroIntegration {
  return {
    name: "embeds",
    hooks: {
      "astro:config:setup": ({ config, updateConfig, injectScript, logger }) => {
        if (config.markdown.processor?.name !== "unified") {
          logger.warn(
            "The embeds integration requires the unified markdown processor (`unified()` " +
              "from @astrojs/markdown-remark); lone URLs will stay plain links.",
          );
        }

        const srcDir = fileURLToPath(config.srcDir);
        const contentConfigPath = CONTENT_CONFIG_NAMES.map((name) => resolve(srcDir, name)).find(
          (path) => existsSync(path),
        );
        if (!contentConfigPath) {
          logger.warn("No content config file found; embeds will not load.");
        }

        injectScript("page-ssr", EMBED_STYLES);
        injectScript("page", LITE_SCRIPTS);
        updateConfig({
          markdown: {
            processor: {
              options: {
                rehypePlugins: [embedPlugin],
              },
            },
          },
          vite: {
            plugins: contentConfigPath
              ? [
                  {
                    name: "embeds:registry",
                    transform(code: string, id: string) {
                      // Dev re-imports may carry cache-busting queries.
                      if (process.env.EMBED_DEBUG) {
                        appendFileSync("/tmp/embed-transform.txt", id + "\n");
                      }
                      if (id.split("?")[0] !== contentConfigPath) return;
                      return `import ${JSON.stringify(EMBED_REGISTRY)};\n${code}`;
                    },
                  },
                ]
              : [],
          },
        });
      },
      "astro:server:setup": ({ server }) => {
        // Vite primes the CSS module caches in the client environment's
        // `buildStart` hooks during its own `initServer`, which only runs once
        // the dev server starts listening. Astro imports the content config
        // (and therefore the styled embed components) before that, so the
        // first CSS transform crashes `vite:css-post` with an empty cache.
        // Make the same call Vite makes eagerly; `buildStart` is idempotent.
        // Verified: removing this hook makes dev fail to load the content
        // config (the first CSS transform crashes `vite:css-post` with the
        // empty cache), so it is required as long as styled components are
        // imported through the content config.
        return server.environments.client.pluginContainer.buildStart();
      },
    },
  };
}
