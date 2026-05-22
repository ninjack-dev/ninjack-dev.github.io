import { defineConfig, passthroughImageService } from "astro/config";
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";

export default defineConfig({
  image: {
    service: passthroughImageService(),
  },
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
