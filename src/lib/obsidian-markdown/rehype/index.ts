import type { Root } from "hast";
import { transformCalloutsHast } from "./callouts.ts";

/**
 * Run every Obsidian HAST-stage handler over a HAST tree. Currently only
 * callout restructuring (see {@link transformCalloutsHast}); the wiki-link
 * and block-link handlers were no-ops and have been removed.
 */
export function finalizeObsidian(tree: Root): void {
  transformCalloutsHast(tree);
}
