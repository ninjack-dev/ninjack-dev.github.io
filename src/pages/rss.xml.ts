import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const writings = await getCollection("writings");
  const published = writings
    .filter((entry) => entry.data.published)
    .sort(
      (a, b) =>
        (b.data.date ?? new Date(0)).getTime() -
        (a.data.date ?? new Date(0)).getTime(),
    );

  return rss({
    title: "ninjack.dev — Writings",
    description:
      "Thoughts on software, games, and other curiosities from ninjack.",
    site: context.site,
    trailingSlash: false,
    stylesheet: "/rss/styles.xsl",
    items: published.map((entry) => ({
      title: entry.data.title ?? entry.id.split("/").at(-1)!,
      pubDate: entry.data.date ?? new Date(),
      description: entry.data.description,
      link: `/writings/${entry.id}`,
    })),
  });
}
