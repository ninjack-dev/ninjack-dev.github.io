import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { embedPlugin } from "./plugin.ts";
import { embedVitePlugin, findContentConfig } from "./vite.ts";

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
        const contentConfigPath = findContentConfig(srcDir);
        if (!contentConfigPath) {
          logger.warn("No content config file found; embeds will not load.");
        }

        injectScript("page-ssr", 'import "virtual:embeds/styles";');
        injectScript("page", 'import "virtual:embeds/scripts";');
        updateConfig({
          markdown: {
            processor: {
              options: {
                rehypePlugins: [embedPlugin],
              },
            },
          },
          vite: {
            plugins: [embedVitePlugin({ contentConfigPath })],
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
