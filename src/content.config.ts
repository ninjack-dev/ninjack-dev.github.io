import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const writings = defineCollection({
  loader: glob({ base: './src/content/Writings', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});

export const collections = { writings };
