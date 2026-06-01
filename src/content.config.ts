import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const pattern = ["**/*.md", ...(!import.meta.env.DEV ? ["!**/_*/**"] : [])];

const writings = defineCollection({
  loader: glob({ base: "./src/content/Writings", pattern: pattern }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    series: z.string().optional(),
    date: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    published: z.boolean().default(false),
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

export const collections = { writings, projects };
