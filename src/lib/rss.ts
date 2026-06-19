import type { RSSOptions } from "@astrojs/rss";

type WritingMeta = {
  data: { title?: string; date?: Date; description?: string };
  id: string;
};

// TODO: this return type is icky, can we do this better?
/** Options shared by every RSS feed on the site. */
export function baseRssOptions(site: URL | string): Omit<Partial<RSSOptions>, "site"> & { site: string | URL } {
  return {
    site,
    trailingSlash: false,
    stylesheet: "/rss/styles.xsl",
  } as const;
}

/** Map a collection of writing entries to RSS feed items. */
export function toRssItems(entries: WritingMeta[]) {
  return entries.map((entry) => ({
    title: entry.data.title ?? entry.id.split("/").at(-1)!,
    pubDate: entry.data.date ?? new Date(),
    description: entry.data.description,
    link: `/writings/${entry.id}`,
  }));
}
