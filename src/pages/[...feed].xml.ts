import rss from "@astrojs/rss";
import getAtomResponse from "../lib/atom";
import type { APIRoute, GetStaticPaths } from "astro";
import type { CollectionEntry } from "astro:content";
import { getOntology } from "../lib/ontology";
import type { OntologyView } from "../lib/ontology";

type WritingEntry = CollectionEntry<"writings">;

/**
 * Catch-all route that generates both RSS and Atom feeds for the root
 * (`/rss.xml`, `/atom.xml`) and each category (`/writings/<category>/rss.xml`,
 * `/writings/<category>/atom.xml`).
 *
 * `params.feed` captures the path segments after the site root joined by `/`.
 * The last segment is the feed type (`rss` or `atom`); everything before it
 * is the scope path (empty → root feed, `writings/<category>` → category feed).
 */
export const getStaticPaths = (async () => {
  const paths: { params: { feed: string } }[] = [];

  paths.push({ params: { feed: "rss" } }, { params: { feed: "atom" } });

  // Ontology node paths omit the `writings/` prefix, so we prepend it for the URL.
  const view = await getOntology();
  for (const node of view.nodes.values()) {
    if (node.kind === "category") {
      paths.push(
        { params: { feed: `writings/${node.path}/rss` } },
        { params: { feed: `writings/${node.path}/atom` } },
      );
    }
  }

  return paths;
}) satisfies GetStaticPaths;

function collectArticles(view: OntologyView, nodePath: string): WritingEntry[] {
  const direct = view.articlesOf(nodePath);
  const nested = view.childrenOf(nodePath).flatMap((child) => collectArticles(view, child.path));
  return [...direct, ...nested];
}

function categoriesFor(entry: WritingEntry): string[] {
  return entry.data.tags ?? [];
}

function toRssItem(entry: WritingEntry) {
  const cats = categoriesFor(entry);
  return {
    title: entry.data.title,
    pubDate: entry.data.date,
    description: entry.data.description,
    link: `/writings/${entry.id}`,
    ...(cats.length > 0 && { categories: cats }),
  };
}

function toAtomItem(entry: WritingEntry, siteUrl: string) {
  const cats = categoriesFor(entry);
  return {
    id: `${siteUrl}/writings/${entry.id}`,
    title: entry.data.title,
    description: entry.data.description,
    pubDate: entry.data.date,
    updatedDate: entry.data.updated ?? entry.data.date,
    link: `/writings/${entry.id}`,
    ...(cats.length > 0 && { categories: cats }),
  };
}

export const GET = (async ({ params, site, url }) => {
  // The last segment is always `rss` or `atom`; preceding segments (after
  // stripping the `writings/` prefix) form the ontology node path.
  const segments = params.feed!.split("/");
  const feedType = segments.pop()!;
  const categoryPath: string | null = segments.length > 1 ? segments.slice(1).join("/") : null;

  // context.site is a `URL` object in Astro 7.x, not a string.
  const siteUrl = (site ?? new URL("https://ninjack.dev")).href.replace(/\/$/, "");

  const view = await getOntology();
  const entries = [
    ...(categoryPath === null ? view.articles : collectArticles(view, categoryPath)),
  ];

  entries.sort(
    (a, b) => (b.data.date ?? new Date(0)).getTime() - (a.data.date ?? new Date(0)).getTime(),
  );

  const node = categoryPath ? view.nodes.get(categoryPath) : null;
  const feedTitle = node ? `ninjack.dev — ${node.name}` : "Jackson Breit";
  const feedDescription = node
    ? `Writings in the ${node.name} category`
    : "Jackson's thoughts on software development, media, and other curiosities";

  if (feedType === "rss") {
    return rss({
      site: siteUrl,
      title: feedTitle,
      description: feedDescription,
      items: entries.map(toRssItem),
      trailingSlash: false,
      stylesheet: "/rss/styles.xsl",
    });
  }

  return getAtomResponse({
    title: feedTitle,
    description: feedDescription,
    site: siteUrl,
    linkRoot: url.pathname,
    author: { name: "Jackson Breit", uri: siteUrl },
    generator: { name: "Astro", uri: "https://astro.build" },
    items: entries.map((entry) => toAtomItem(entry, siteUrl)),
  });
}) satisfies APIRoute;
