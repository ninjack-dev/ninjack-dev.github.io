import type { APIContext } from "astro";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

import { baseRssOptions, toRssItems } from "../lib/rss.ts";

export async function GET(context: APIContext) {
  const writings = await getCollection("writings");
  const published = writings
    .filter((entry) => entry.data.published)
    .sort(
      // TODO: Anything but this
      (a, b) =>
        (b.data.published ?? new Date(0)).getTime() -
        (a.data.published ?? new Date(0)).getTime(),
    );

  return rss({
    ...baseRssOptions(context.site),
    title: "ninjack.dev — Writings",
    description:
      "Thoughts on software development, media, and other curiosities from Jackson.",
    items: toRssItems(published),
  });
}
