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
      provider: fontProviders.local(),
      name: "JetBrains Mono Nerd Font",
      cssVariable: "--font-jetbrains-mono",
      fallbacks: ["monospace"],
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/JetBrainsMonoNerdFont-Regular.woff2"],
          },
          {
            weight: 600,
            style: "normal",
            src: ["./src/assets/fonts/JetBrainsMonoNerdFont-Bold.woff2"],
          },
        ],
      },
    },
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark-dimmed",
    },
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
