import { defineConfig } from "astro/config";
import rehypeMathjax from "https://esm.sh/rehype-mathjax@7";
import remarkMath from "https://esm.sh/remark-math@6";
import remarkToc from "https://esm.sh/remark-math@9";

export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkMath,
      remarkToc,
    ],
    rehypePlugins: [
      rehypeMathjax(),
    ],
  },
});
