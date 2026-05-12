import { defineConfig } from "astro/config";
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";
import { remarkObsidian } from "./src/lib/obsidian-markdown/remark/index.ts";
import { obsidianHandlers } from "./src/lib/obsidian-markdown/rehype/index.ts";

export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkMath,
      remarkToc,
      remarkObsidian,
    ],
    remarkRehype: { handlers: obsidianHandlers },
    rehypePlugins: [
      rehypeMathjax,
    ],
  },
});
