import {
  type ArticleCoords,
  classifyTree,
  type OntologyNode,
  publishNodes,
  type TreeClassification,
} from "./index.ts";
import type { GlobPlusIntegration } from "../../loaders/globplus/types.ts";

/**
 * `ontology` — a globplus integration that derives the `Writings` taxonomy from
 * the directory layout (ADR 0001) and stamps it onto each entry (ADR 0002).
 *
 * Hook design:
 *  - `gp:files:resolved` (whole-tree view): classify the full matched file set
 *    with {@link classifyTree}. Per-file hooks can't see siblings, so all
 *    classification happens here and is cached in `coordsById` (keyed by entry
 *    id) for the per-file `gp:entry:data` lookup. Also caches the node set for
 *    the end-of-load guard.
 *  - `gp:entry:data` (per file, before Zod parse): look the file up by its
 *    entry id and stamp `data.category` (display-name path) and `data.series`
 *    (display name or `null`) onto the raw frontmatter.
 *  - `gp:load:done`: build-error guard (ADR 0002) — an entry id equal to a
 *    *category* node path is illegal (categories have no description); a match
 *    on a *series* node path is a valid series description.
 *
 * Classification includes `published: false` content and ignores `attachments/`
 * dirs and `disambiguate.md` markers (handled inside `classifyTree`).
 */
export function ontology(): GlobPlusIntegration {
  // Entry id → article coordinates, rebuilt each load.
  let coordsById = new Map<string, ArticleCoords>();
  // Node-path → node, rebuilt each load (for the build-error guard).
  let nodes = new Map<string, OntologyNode>();

  return {
    name: "gp:ontology",
    hooks: {
      "gp:files:resolved": ({ tree }) => {
        const classification: TreeClassification = classifyTree(tree);
        nodes = classification.nodes;
        coordsById = classification.coordsById;
        publishNodes(classification.nodes);
      },

      "gp:entry:data": ({ id, data }) => {
        const coords = coordsById.get(id);
        if (!coords) {
          // Loose Markdown at the Writings root (forbidden, but degrade
          // gracefully): no category, no series.
          data.category = [];
          data.series = null;
          return;
        }
        data.category = coords.category;
        data.series = coords.series;
      },

      // `disambiguate.md` is a structural marker, never an article: skip storing
      // it so it isn't routed or counted. (`attachments/` never matches `*.md`.)
      "gp:entry:store": ({ entry, skip }) => {
        const base = (entry.filePath ?? "").split("/").at(-1)?.toLowerCase();
        if (base === "disambiguate.md") skip();
      },

      "gp:load:done": ({ entries }) => {
        for (const entry of entries) {
          const node = nodes.get(entry.id);
          if (node?.kind === "category") {
            throw new Error(
              `[gp:ontology] Entry id "${entry.id}" (${entry.filePath}) ` +
                `collides with a category node path. Categories do not have ` +
                `descriptions; only series do. Remove or rename this file.`,
            );
          }
        }
      },
    },
  };
}
