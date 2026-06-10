import { defineConfig, fontProviders, passthroughImageService } from "astro/config";
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
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Source Serif 4",
      cssVariable: "--font-source-serif",
      weights: [400, 600],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      fallbacks: ["serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "JetBrains Mono",
      cssVariable: "--font-jetbrains-mono",
      weights: ["100 900"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["monospace"],
    },
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark-dimmed",
    },
    processor: unified({
      remarkPlugins: [remarkMath, remarkToc],
      rehypePlugins: [rehypeMathjax],
      smartypants: {
        ellipses: false,
        backticks: false,
      },
    }),
  },
});
