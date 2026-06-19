import rss from "@astrojs/rss";
import type { GetStaticPaths } from "astro";
import type { CollectionEntry } from "astro:content";
import { getOntology } from "../../lib/ontology/index.ts";
import type { OntologyView } from "../../lib/ontology/index.ts";

import { baseRssOptions, toRssItems } from "../../lib/rss.ts";

type WritingEntry = CollectionEntry<"writings">;

export const getStaticPaths = (async () => {
  const view = await getOntology();
  return [...view.nodes.values()]
    .filter((node) => node.kind === "category")
    .map((node) => ({
      params: { path: node.path },
      props: { nodePath: node.path },
    }));
}) satisfies GetStaticPaths;

export async function GET({ props, site }) {
  const { nodePath } = props;
  const view = await getOntology();
  const node = view.nodes.get(nodePath)!;
  const articles = collectArticles(view, nodePath);

  return rss({
    ...baseRssOptions(site),
    title: `ninjack.dev — ${node.name}`,
    description: `Writings in the ${node.name} category`,
    items: toRssItems(articles),
  });
}

function collectArticles(
  view: OntologyView,
  nodePath: string,
): WritingEntry[] {
  const direct = view.articlesOf(nodePath);
  const nested = view
    .childrenOf(nodePath)
    .flatMap((child) => collectArticles(view, child.path));
  return [...direct, ...nested];
}
