import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { embedPlugin } from "./plugin.ts";
import { embedVitePlugin, findContentConfig, primeClientCssCaches } from "./vite.ts";

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
      "astro:server:setup": ({ server }) => primeClientCssCaches(server),
    },
  };
}
