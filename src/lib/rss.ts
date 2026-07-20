import type { RSSOptions, RSSFeedItem } from "@astrojs/rss";
import type { CollectionEntry } from "astro:content";

/** Options shared by every RSS feed on the site. */
export const baseRssOptions: Partial<RSSOptions> = {
  trailingSlash: false,
  stylesheet: "/rss/styles.xsl",
} as const;

/** Map a collection of writing entries to RSS feed items. */
export function toRssItems(entries: CollectionEntry<"writings">[]) {
  return entries.map((entry) => ({
    title: entry.data.title ?? entry.id.split("/").at(-1)!,
    pubDate: entry.data.date ?? new Date(),
    description: entry.data.description,
    link: `/writings/${entry.id}`,
  } satisfies RSSFeedItem));
}
