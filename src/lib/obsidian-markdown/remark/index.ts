import type { Root } from "mdast";
import { transformWikiLinks } from "./wiki-links.ts";
import { transformWikiEmbeds } from "./wiki-embeds.ts";
import { transformCallouts } from "./callouts.ts";
import { transformBlockLinks } from "./block-links.ts";

/**
 * Run every Obsidian tokenizer over an MDAST tree, in order. These are pure
 * syntax tokenizers: they emit nodes carrying raw target / fragment
 * text and do no resolution or slugging. Href resolution for the emitted
 * `obsidianWikiLink` nodes is the loader's job.
 *
 * Embeds are intentionally tokenized to relative `image` nodes here so they ride
 * the existing `imagePaths` → `assetImports` pipeline; the caller must run this
 * before Astro's image-collection step (i.e. as an MDAST-stage transform).
 */
export function tokenizeObsidian(tree: Root): void {
  transformWikiEmbeds(tree);
  transformWikiLinks(tree);
  transformCallouts(tree);
  transformBlockLinks(tree);
}
