import { defineConfig, passthroughImageService } from "astro/config";
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
    remarkPlugins: [
      remarkMath,
      remarkToc,
    ],
    rehypePlugins: [
      rehypeMathjax,
    ],
  },
});
