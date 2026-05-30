import { defineConfig, passthroughImageService } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";
import pagefind from "./src/integrations/pagefind.ts";

export default defineConfig({
  image: {
    service: passthroughImageService(),
  },
  integrations: [pagefind()],
  prefetch: true,
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkMath,
        remarkToc,
      ],
      rehypePlugins: [
        rehypeMathjax,
      ],
      smartypants: {
        ellipses: false,
        backticks: false,
      },
    }),
  },
});
