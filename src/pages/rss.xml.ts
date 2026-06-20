import type { APIContext } from "astro";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

import { baseRssOptions, toRssItems } from "../lib/rss.ts";

export async function GET(context: APIContext) {
  const writings = await getCollection("writings");
  const published = writings
    .filter((entry) => entry.data.published)
    .sort(
      (a, b) => (b.data.date ?? new Date(0)).getTime() - (a.data.date ?? new Date(0)).getTime(),
    );

  return rss({
    ...baseRssOptions(context.site ?? "ninjack.dev"),
    title: "Jackson Breit",
    description: "Jackson's thoughts on software development, media, and other curiosities",
    items: toRssItems(published),
  });
}
