import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { globplus, markdownHooks } from "./loaders/globplus/index.ts";
import { obsidian } from "./lib/obsidian.ts";
import { ontology } from "./lib/ontology/index.ts";
import { syncMeta } from "./lib/sync-meta.ts";

const pattern = ["**/*.md", ...(import.meta.env.PROD ? ["!**/_*/**", "!**/_*"] : [])];

const writings = defineCollection({
  loader: globplus({
    base: "./src/content/Writings",
    pattern: pattern,
    integrations: [
      ontology(),
      markdownHooks(),
      obsidian(),
      syncMeta({
        path: "./src/content/Writings/meta.json",
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
    title: z.string(),
    description: z.string().optional(),
    category: z.array(z.string()).optional(),
    series: z.string().nullable().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    published: z.boolean().default(import.meta.env.DEV),
  }),
});

const tags = defineCollection({
  loader: glob({
    base: "./src/content/Tags",
    pattern: pattern,
  }),
});

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
