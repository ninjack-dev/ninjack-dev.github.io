import { z } from "astro/zod";

export const atomSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    pubDate: z
      .union([z.string(), z.number(), z.date()])
      .transform((value) => new Date(value))
      .refine((value) => !isNaN(value.getTime()))
      .optional(),
    updatedDate: z
      .union([z.string(), z.number(), z.date()])
      .transform((value) => new Date(value))
      .refine((value) => !isNaN(value.getTime()))
      .optional(),
    content: z.string().optional(),
    link: z.string().optional(),
    id: z.string(),
    author: z
      .union([
        z.string(),
        z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          uri: z.string().optional(),
        }),
      ])
      .optional(),
    categories: z.array(z.string()).optional(),
  })
  .refine((data) => data.title || data.description || data.content, {
    message: "At least one of title, description, or content is required",
    path: ["title"],
  });
