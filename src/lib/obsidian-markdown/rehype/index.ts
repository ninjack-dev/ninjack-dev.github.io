import type { Root } from "hast";
import { transformBlockLinksHast } from "./block-links.ts";
import { transformCalloutsHast } from "./callouts.ts";
import { transformWikiEmbedsHast } from "./wiki-embeds.ts";
import { transformWikiLinksHast } from "./wiki-links.ts";

/**
 * Run every Obsidian HAST-stage handler over a HAST tree, in order. Most are
 * intentional no-ops (their nodes are emitted in final form at the MDAST stage);
 * callouts are restructured here from their marker `<div>` into the final
 * `<div class="callout">` / `<details class="callout">` markup. See each module.
 */
export function finalizeObsidian(tree: Root): void {
  transformWikiLinksHast(tree);
  transformWikiEmbedsHast(tree);
  transformCalloutsHast(tree);
  transformBlockLinksHast(tree);
}
