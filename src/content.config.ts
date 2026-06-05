import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { globplus, markdownHooks } from "./loaders/globplus/index.ts";
import { syncMeta } from "./sync-meta.ts";

const pattern = ["**/*.md", ...(!import.meta.env.DEV ? ["!**/_*/**"] : [])];

const writings = defineCollection({
  loader: globplus({
    base: "./src/content/Writings",
    pattern: pattern,
    integrations: [
      markdownHooks,
      syncMeta({
        path: './src/content/Writings/meta.json',
        whitelist: [
          "root",
          "heading",
          "paragraph",
          "list",
          "listItem",
          "blockquote",
          "code",
          "table",
          "tableRow",
          "tableCell",
          "thematicBreak",
          "image",
          "footnoteDefinition",
          "definition",
        ],
      }),
    ],
  }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    series: z.string().optional(),
    date: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    published: z.boolean().default(false),
  }),
});

const tags = defineCollection({
  loader: glob({
    base: "./src/content/Tags",
    pattern: pattern,
  })
})

const projects = defineCollection({
  loader: glob({
    base: "./src/content/Projects",
    pattern: pattern,
  }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    published: z.boolean().default(false),
  }),
});

export const collections = { writings, projects, tags };
