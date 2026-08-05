import type { Root } from "hast";
import { transformCalloutsHast } from "./callouts.ts";
import { transformCommentsHast } from "./comments.ts";

/**
 * Run every Obsidian HAST-stage handler over a HAST tree.
 */
export function finalizeObsidian(tree: Root): void {
  transformCalloutsHast(tree);
  transformCommentsHast(tree);
}
